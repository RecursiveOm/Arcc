import hashlib
import logging
import os
import shutil
import sqlite3
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse
from fastapi import FastAPI, HTTPException, UploadFile, Request
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field, model_validator
from . import db, pipeline, chat, vectors
from .config import MEDIA, MAX_UPLOAD
from .transcript import youtube_id, validate_file
from .media import ProcessingError
from .llm import client as llm_client

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)

@asynccontextmanager
async def lifespan(app):
    db.init()
    yield
    pipeline.executor.shutdown(wait=True)

app=FastAPI(title='ARC · Understand every moment.',lifespan=lifespan)

@app.middleware('http')
async def local_origin(request: Request, call_next):
    # Local app, no authentication. Prevent cross-site writes and DNS rebinding.
    host=(request.url.hostname or '').lower()
    origin=request.headers.get('origin')
    if host not in {'localhost','127.0.0.1','::1','testserver'}:
        return JSONResponse({'detail':'ARC is available on localhost only.'},status_code=403)
    if request.method not in {'GET','HEAD','OPTIONS'} and origin:
        p=urlparse(origin)
        if p.scheme not in {'http','https'} or p.hostname not in {'localhost','127.0.0.1','::1'}:
            return JSONResponse({'detail':'Cross-site requests are not allowed.'},status_code=403)
    return await call_next(request)

@app.exception_handler(ProcessingError)
async def processing_error(request, exc):
    return JSONResponse({'detail':str(exc)},status_code=502)

def require(video_id):
    v=db.get(video_id)
    if not v: raise HTTPException(404,'Video not found.')
    return v

def public(v, full=False):
    excluded={'source_key','media_path'}
    if not full: excluded|={'transcript','chunks','analysis','ml'}
    return {**{k:value for k,value in v.items() if k not in excluded},'has_media':bool(v['media_path'] and Path(v['media_path']).name.startswith('playback.') and Path(v['media_path']).exists()), 'has_transcript':bool(v.get('transcript') or v.get('has_transcript'))}

class YoutubeInput(BaseModel):
    url: str = Field(min_length=1,max_length=2048)

class ChatInput(BaseModel):
    question: str = Field(min_length=1,max_length=2000)
    start: float | None = Field(default=None,ge=0,allow_inf_nan=False)
    end: float | None = Field(default=None,gt=0,allow_inf_nan=False)
    @model_validator(mode='after')
    def validate_range(self):
        self.question=self.question.strip()
        if not self.question: raise ValueError('Enter a question.')
        if (self.start is None)!=(self.end is None) or (self.start is not None and self.start>=self.end):
            raise ValueError('Supply a start and end time with start before end.')
        return self

@app.get('/api/settings')
def settings():
    return {'deepseek_configured':bool(llm_client.api_key),'deepseek_model':llm_client.model,
            'whisper_model':os.getenv('WHISPER_MODEL','small'),'ffmpeg_available':bool(shutil.which('ffmpeg')),
            'max_upload_mb':MAX_UPLOAD//1024**2}

@app.get('/api/videos')
def videos():
    with db.connect() as c:
        rows=c.execute('SELECT id,source_type,title,youtube_id,filename,file_size,duration,language,media_path,thumbnail,status,stage,error,created_at,embedded,(transcript IS NOT NULL) AS has_transcript FROM videos ORDER BY created_at DESC').fetchall()
    return [public(db.decode(r)) for r in rows]

@app.post('/api/videos/youtube')
def youtube(body: YoutubeInput):
    try: yt=youtube_id(body.url)
    except ValueError as exc: raise HTTPException(422,str(exc)) from None
    key='youtube:'+yt
    existing=db.duplicate(key)
    if existing: return public(existing)
    video_id=uuid.uuid4().hex
    try: db.insert({'id':video_id,'source_key':key,'source_type':'youtube','youtube_id':yt,'title':'YouTube video'})
    except sqlite3.IntegrityError: return public(db.duplicate(key))
    pipeline.submit(video_id)
    return public(require(video_id))

@app.post('/api/videos/upload')
async def upload(file: UploadFile):
    try: name,ext=validate_file(file.filename)
    except ValueError as exc: raise HTTPException(422,str(exc)) from None
    video_id=uuid.uuid4().hex
    folder=MEDIA/video_id
    folder.mkdir()
    target=folder/('source'+ext)
    size=0
    digest=hashlib.sha256()
    try:
        with target.open('wb') as out:
            while data:=await file.read(1024*1024):
                size+=len(data)
                if size>MAX_UPLOAD: raise HTTPException(413,f'File exceeds {MAX_UPLOAD//1024**2} MB limit.')
                digest.update(data)
                out.write(data)
        if not size: raise HTTPException(422,'The uploaded file is empty.')
        key='upload:'+digest.hexdigest()
        existing=db.duplicate(key)
        if existing:
            shutil.rmtree(folder)
            return public(existing)
        try:
            db.insert({'id':video_id,'source_key':key,'source_type':'upload','title':name,'filename':name,'file_size':size,'media_path':str(target)})
        except sqlite3.IntegrityError:
            shutil.rmtree(folder)
            return public(db.duplicate(key))
        pipeline.submit(video_id)
        return public(require(video_id))
    except BaseException:
        if not db.get(video_id): shutil.rmtree(folder,ignore_errors=True)
        raise
    finally:
        await file.close()

@app.get('/api/videos/{video_id}')
def video(video_id: str): return public(require(video_id),True)

@app.get('/api/videos/{video_id}/status')
def status(video_id: str): return public(require(video_id))

@app.get('/api/videos/{video_id}/transcript')
def transcript(video_id: str): return require(video_id)['transcript'] or []

@app.get('/api/videos/{video_id}/analysis')
def analysis(video_id: str): return require(video_id)['analysis']

@app.get('/api/videos/{video_id}/chat')
def history(video_id: str):
    require(video_id)
    return db.history(video_id)

@app.post('/api/videos/{video_id}/chat')
def ask(video_id: str, body: ChatInput):
    v=require(video_id)
    if not v['embedded']: raise HTTPException(409,'Wait for transcript indexing to finish.')
    if body.end is not None and v['duration'] and body.end>v['duration']+0.1:
        raise HTTPException(422,'Time range extends beyond this video.')
    return chat.answer(v,body.question,body.start,body.end)

@app.post('/api/videos/{video_id}/retry')
def retry(video_id: str):
    v=require(video_id)
    if v['status']=='failed': pipeline.submit(video_id)
    return public(require(video_id))

@app.get('/api/videos/{video_id}/media')
def media(video_id: str):
    v=require(video_id)
    path=Path(v['media_path']).resolve() if v['media_path'] else None
    if not path or not path.is_relative_to(MEDIA.resolve()) or not path.is_file(): raise HTTPException(404,'Media not available.')
    return FileResponse(path)

@app.delete('/api/videos/{video_id}')
def delete(video_id: str):
    require(video_id)
    with pipeline.active_lock:
        if video_id in pipeline.active: raise HTTPException(409,'Wait for processing to finish before deleting.')
        vectors.delete(video_id)
        with db.connect() as c: c.execute('DELETE FROM videos WHERE id=?',(video_id,))
        shutil.rmtree(MEDIA/video_id,ignore_errors=True)
    return {'deleted':True}
