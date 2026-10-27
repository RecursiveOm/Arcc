import json
from types import SimpleNamespace

import numpy as np
import pytest
from fastapi.testclient import TestClient

from app import db, media, pipeline, translation, vectors
from app.llm import client
from app.main import app
from app.transcript import clean_segments


@pytest.mark.parametrize('language,original,english', [
    ('mr', 'आज आपण यंत्र शिक्षणाबद्दल शिकणार आहोत.', 'Today we will learn about machine learning.'),
    ('hi', 'आज हम मशीन लर्निंग के बारे में सीखेंगे।', 'Today we will learn about machine learning.'),
])
def test_translation_preserves_original_timestamps_and_cache(video, monkeypatch, language, original, english):
    transcript=clean_segments([{'start':1.25,'end':6.5,'text':original}])
    db.update('a',transcript=transcript,language=language)
    calls=[]
    def complete(system, content):
        calls.append(json.loads(content))
        return json.dumps({'segments':[{'segment_id':0,'text':english}]})
    monkeypatch.setattr(client,'complete',complete)
    result=translation.translate(db.get('a'),lambda _:None)
    assert result==[{'start':1.25,'end':6.5,'text':english,'original_text':original,'translation_language':'en'}]
    assert db.get('a')['language']==language
    translation.translate(db.get('a'),lambda _:None)
    # Even an old snapshot reuses the existing content-addressed LLM cache.
    translation.translate({**video,'language':language,'transcript':transcript},lambda _:None)
    assert len(calls)==1
    assert calls[0]['segments'][0]['text']==original


def test_translation_repair_rejects_omissions_reordering_and_blank(video,monkeypatch):
    text=[{'start':i,'end':i+1,'text':'नमस्कार','original_text':'नमस्कार'} for i in range(2)]
    db.update('a',transcript=text,language='mr')
    responses=iter([{'segments':[{'segment_id':1,'text':'Hello'},{'segment_id':0,'text':'Hello'}]},
                    {'segments':[{'segment_id':0,'text':'Hello'},{'segment_id':1,'text':'Hello'}]}])
    monkeypatch.setattr(client,'complete',lambda *args:json.dumps(next(responses)))
    assert len(translation.translate(db.get('a'),lambda _:None))==2
    schema=translation.response_schema(2)
    for result in [{'segments':[{'segment_id':0,'text':'Hello'}]},
                   {'segments':[{'segment_id':0,'text':' '},{'segment_id':1,'text':'Hello'}]},
                   {'segments':[{'segment_id':0,'text':'Hello'},{'segment_id':0,'text':'Hello'}]}]:
        with pytest.raises(ValueError): schema.model_validate(result)


def test_partial_failure_resumes_without_retranscribing(video,monkeypatch,tmp_path):
    transcript=[{'start':i,'end':i+1,'text':'नमस्कार'} for i in range(33)]
    db.update('a',transcript=transcript,language='mr')
    monkeypatch.setattr(pipeline,'MEDIA',tmp_path)
    monkeypatch.setattr(media,'transcribe',lambda *a,**k:pytest.fail('Speech must not be repeated'))
    calls=[]
    def complete(system,content):
        items=json.loads(content)['segments']
        calls.append(len(items))
        if len(calls)==2: raise media.ProcessingError('Translation provider unavailable')
        return json.dumps({'segments':[{'segment_id':i['segment_id'],'text':'Hello'} for i in items]})
    monkeypatch.setattr(client,'complete',complete)
    monkeypatch.setattr(vectors,'embed',lambda texts:np.ones((len(texts),3)))
    monkeypatch.setattr(vectors,'store',lambda *args:None)
    monkeypatch.setattr(vectors,'delete',lambda *args:None)
    observed=[]
    monkeypatch.setattr(pipeline,'analyze',lambda v:observed.extend(c['text'] for c in v['chunks']) or {'overview':'Hello'})
    pipeline.process('a')
    partial=db.get('a')
    assert partial['status']=='failed' and not partial['embedded']
    assert sum(s.get('translation_language')=='en' for s in partial['transcript'])==32
    pipeline.process('a')
    assert db.get('a')['status']=='ready' and calls==[32,1,1]
    assert all('नमस्कार' not in text for text in observed)
    assert all(s['original_text']=='नमस्कार' for s in db.get('a')['transcript'])


def test_english_skips_translation(video,monkeypatch):
    monkeypatch.setattr(client,'structured',lambda *args:pytest.fail('English needs no translation call'))
    video.update(language='en',transcript=[{'start':0,'end':2,'text':'Hello'}])
    assert not translation.needs_translation(video)
    assert translation.translate(video,lambda _:None)==video['transcript']


def test_whisper_uses_original_language_not_audio_translation(monkeypatch):
    calls=[]
    class Whisper:
        def transcribe(self,path,**kwargs):
            calls.append(kwargs)
            return iter([SimpleNamespace(start=0,end=1,text='नमस्कार')]),SimpleNamespace(language='mr',duration=1)
    monkeypatch.setattr(media,'whisper',lambda:Whisper())
    result,language,_=media.transcribe('test.wav',lambda _:None,language='mr')
    assert language=='mr' and result[0]['text']=='नमस्कार'
    assert calls[0]['task']=='transcribe' and calls[0]['language']=='mr'


def test_language_hint_and_saved_conversion(monkeypatch,tmp_path,video):
    import app.main as main
    monkeypatch.setattr(main,'MEDIA',tmp_path)
    submitted=[]
    monkeypatch.setattr(pipeline,'submit',lambda identifier:submitted.append(identifier))
    browser=TestClient(app)
    result=browser.post('/api/videos/upload',files={'file':('hindi.mp4',b'new content')},data={'language':'hi'})
    assert result.status_code==200 and db.get(result.json()['id'])['language']=='hi'
    assert browser.post('/api/videos/youtube',json={'url':'https://youtu.be/jNQXAC9IVRw','language':'shell'}).status_code==422
    db.update('a',language='mr',status='ready',transcript=[{'start':0,'end':1,'text':'नमस्कार'}])
    assert browser.post('/api/videos/a/translate').status_code==200
    assert submitted[-1]=='a'
    db.update('a',status='processing')
    assert browser.post('/api/videos/a/translate').status_code==409
