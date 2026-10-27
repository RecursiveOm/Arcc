import logging
from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from pathlib import Path
from . import db, media, vectors
from .config import MEDIA
from .transcript import clean_segments, chunk_segments
from .ml import safe_discover
from .llm import analyze
from .translation import needs_translation, translate

log=logging.getLogger(__name__)
executor=ThreadPoolExecutor(max_workers=1,thread_name_prefix='arc-worker')
active=set()
active_lock=Lock()

def submit(video_id):
    with active_lock:
        if video_id in active: return
        active.add(video_id)
        db.update(video_id,status='queued',stage='Queued',error=None)
    executor.submit(process,video_id)

def process(video_id):
    folder=MEDIA/video_id
    folder.mkdir(exist_ok=True)
    def stage(text): db.update(video_id,status='processing',stage=text)
    try:
        v=db.get(video_id)
        if not v['transcript']:
            path=Path(v['media_path']) if v['media_path'] else None
            if v['source_type']=='youtube' and (not path or not path.exists()):
                stage('Downloading audio')
                path,info=media.download(video_id,v['youtube_id'])
                db.update(video_id,title=info.get('title') or v['title'],duration=info.get('duration'),thumbnail=info.get('thumbnail'),media_path=str(path))
            stage('Extracting audio')
            info=media.probe(path)
            audio=media.extract(path,video_id)
            if v['source_type']=='upload' and path.name not in {'playback.mp4','playback.m4a'}:
                stage('Preparing video playback')
                playback=media.preview(path,info)
                db.update(video_id,media_path=str(playback))
                path.unlink(missing_ok=True)
            stage('Loading speech model')
            raw,language,duration=media.transcribe(audio,stage,language=v.get('language'))
            transcript=clean_segments(raw)
            if not transcript: raise media.ProcessingError('No speech was detected in this video.')
            db.update(video_id,transcript=transcript,language=language,duration=duration)
            audio.unlink(missing_ok=True)
            if v['source_type']=='youtube':
                path.unlink(missing_ok=True)
                db.update(video_id,media_path=None)
        v=db.get(video_id)
        if needs_translation(v):
            # Existing results from the original language must not mix with English evidence.
            db.update(video_id,chunks=None,ml=None,analysis=None,embedded=0)
            translate(v,stage)
            v=db.get(video_id)
        if not v['chunks']:
            stage('Structuring transcript')
            db.update(video_id,chunks=chunk_segments(video_id,v['transcript']))
        v=db.get(video_id)
        if not v['embedded']:
            stage('Creating embeddings')
            embeddings=vectors.embed([c['text'] for c in v['chunks']])
            if any(s.get('translation_language') == 'en' for s in v['transcript']):
                vectors.delete(video_id)
            vectors.store(video_id,v['chunks'],embeddings)
            stage('Discovering topics · K-Means / PCA')
            ml=safe_discover(v['chunks'],embeddings)
            db.update(video_id,chunks=v['chunks'],ml=ml,embedded=1)
        v=db.get(video_id)
        if not v['analysis']:
            stage('Generating summary and timeline')
            db.update(video_id,analysis=analyze(v))
        db.update(video_id,status='ready',stage='Ready',error=None)
    except Exception as exc:
        log.exception('Video %s failed',video_id)
        message=str(exc) if isinstance(exc,media.ProcessingError) else 'Local processing failed. Check backend logs, available memory, model downloads, and retry.'
        db.update(video_id,status='failed',stage='Processing failed',error=message)
    finally:
        (folder/'audio.wav').unlink(missing_ok=True)
        with active_lock: active.discard(video_id)
