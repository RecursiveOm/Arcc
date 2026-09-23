import json
import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from app import db, vectors, chat, pipeline, media, llm
from app.main import app
from app.transcript import youtube_id, validate_file, chunk_segments, clean_segments, range_segments

@pytest.mark.parametrize('url',['https://www.youtube.com/watch?v=jNQXAC9IVRw','https://youtu.be/jNQXAC9IVRw?t=2','https://youtube.com/shorts/jNQXAC9IVRw'])
def test_youtube(url): assert youtube_id(url)=='jNQXAC9IVRw'

@pytest.mark.parametrize('url',['https://youtube.com.evil.test/watch?v=jNQXAC9IVRw','file:///etc/passwd','https://youtube.com/playlist?list=x','https://user:pass@youtube.com/watch?v=jNQXAC9IVRw','https://youtu.be/abc','https://youtube.com:8000/watch?v=jNQXAC9IVRw'])
def test_invalid_youtube(url):
    with pytest.raises(ValueError): youtube_id(url)

def test_file_validation():
    assert validate_file('../../test.MP4')==('test.MP4','.mp4')
    assert validate_file('C:\\fakepath\\lecture.mov')==('lecture.mov','.mov')
    with pytest.raises(ValueError): validate_file('video.exe')

def test_chunks_and_cleanup():
    raw=[{'start':i*10,'end':i*10+9,'text':'  sentence '+('concept '*80)} for i in range(20)]
    segments=clean_segments(raw+[{'start':201,'end':202,'text':' '}])
    chunks=chunk_segments('v',segments)
    assert len(chunks)>2
    assert chunks[0]['start']==0 and chunks[-1]['end']==199
    assert all(c['start'] in [s['start'] for s in segments] and c['end'] in [s['end'] for s in segments] for c in chunks)
    assert all(c['video_id']=='v' and c['chunk_id']==i for i,c in enumerate(chunks))
    assert segments[0]['original_text']==raw[0]['text']
    assert '  ' not in segments[0]['text']

def test_range_boundary():
    segments=[{'start':0,'end':5,'text':'outside'},{'start':5,'end':8,'text':'inside'},{'start':8,'end':12,'text':'overlap'}]
    assert [s['text'] for s in range_segments(segments,5,10)]==['inside']

def test_retrieval_filter(monkeypatch):
    called={}
    class Collection:
        def query(self,**kwargs):
            called.update(kwargs)
            return {'metadatas':[[{'video_id':'a','chunk_id':1},{'video_id':'b','chunk_id':0}]]}
    monkeypatch.setattr(vectors,'collection',lambda:Collection())
    monkeypatch.setattr(vectors,'embed',lambda _:np.ones((1,3)))
    chunks=[{'chunk_id':i,'video_id':'a','text':str(i)} for i in range(4)]
    result=vectors.retrieve('a','question',chunks)
    assert called['where']=={'video_id':'a'}
    assert all(c['video_id']=='a' for c in result)
    assert result[0]['chunk_id']==1

def test_real_chroma_isolation(tmp_path, monkeypatch):
    import chromadb
    collection=chromadb.PersistentClient(path=str(tmp_path/'chroma')).get_or_create_collection('test_chunks')
    monkeypatch.setattr(vectors,'collection',lambda:collection)
    monkeypatch.setattr(vectors,'embed',lambda _:np.array([[1.,0.,0.]]))
    a=[{'chunk_id':0,'video_id':'a','start':0.,'end':1.,'text':'alpha'}]
    b=[{'chunk_id':0,'video_id':'b','start':0.,'end':1.,'text':'beta'}]
    vectors.store('a',a,[[0.,1.,0.]])
    vectors.store('b',b,[[1.,0.,0.]])
    assert vectors.retrieve('a','question',a)==a

def test_rag_context_range_and_budget(monkeypatch):
    monkeypatch.setattr(vectors,'embed',lambda t:np.ones((len(t),3)))
    video={'id':'a','transcript':[{'start':0,'end':5,'text':'outside'},{'start':5,'end':8,'text':'inside'}]}
    context=chat.context_for(video,'question',5,9)
    assert context[0]['text']=='inside' and context[0]['start']==5
    monkeypatch.setattr(vectors,'retrieve',lambda *args:[{'start':0,'end':1,'text':'x'*15000}]*5)
    video['chunks']=[]
    assert sum(len(c['text']) for c in chat.context_for(video,'question'))<=20000

def test_analysis_parsing_repair(monkeypatch,video):
    outputs=iter(['not json',json.dumps({'summary':'A real digest'})])
    calls=[]
    def complete(*args): calls.append(1); return next(outputs)
    monkeypatch.setattr(llm.client,'complete',complete)
    assert llm.client.structured(llm.Digest,'Summarize',{},'a').summary=='A real digest'
    assert len(calls)==2
    assert llm.client.structured(llm.Digest,'Summarize',{},'a').summary=='A real digest'
    assert len(calls)==2
    with pytest.raises(ValidationError): llm.Analysis.model_validate({'overview':'incomplete'})

def test_duplicate_upload_and_validation(monkeypatch,tmp_path):
    import app.main as main
    monkeypatch.setattr(main,'MEDIA',tmp_path)
    monkeypatch.setattr(pipeline,'submit',lambda _:None)
    client=TestClient(app)
    first=client.post('/api/videos/upload',files={'file':('lecture.mp4',b'test-data','video/mp4')})
    second=client.post('/api/videos/upload',files={'file':('different.mp4',b'test-data','video/mp4')})
    assert first.status_code==200 and first.json()['id']==second.json()['id']
    assert 'media_path' not in first.json()
    assert client.post('/api/videos/upload',files={'file':('x.exe',b'test')}).status_code==422
    assert client.post('/api/videos/upload',files={'file':('x.mp4',b'')}).status_code==422
    monkeypatch.setattr(main,'MAX_UPLOAD',3)
    assert client.post('/api/videos/upload',files={'file':('x.mp4',b'four')}).status_code==413

def test_duplicate_youtube(monkeypatch):
    monkeypatch.setattr(pipeline,'submit',lambda _:None)
    client=TestClient(app)
    first=client.post('/api/videos/youtube',json={'url':'https://youtu.be/jNQXAC9IVRw'})
    second=client.post('/api/videos/youtube',json={'url':'https://youtube.com/watch?v=jNQXAC9IVRw'})
    assert first.json()['id']==second.json()['id']
    assert client.post('/api/videos/youtube',json={'url':'https://evil.test/foo'}).status_code==422

def test_failed_job_and_interruption(video,monkeypatch,tmp_path):
    monkeypatch.setattr(pipeline,'MEDIA',tmp_path)
    monkeypatch.setattr(media,'probe',lambda _: (_ for _ in ()).throw(media.ProcessingError('Invalid media')))
    pipeline.process('a')
    assert db.get('a')['status']=='failed' and db.get('a')['error']=='Invalid media'
    db.update('a',status='processing')
    db.init()
    assert db.get('a')['status']=='failed' and db.get('a')['stage']=='Interrupted'

def test_http_security_and_range(video):
    client=TestClient(app)
    assert client.post('/api/videos/a/chat',json={'question':'why','start':10,'end':2}).status_code==422
    assert client.post('/api/videos/a/chat',json={'question':' '}).status_code==422
    assert client.post('/api/videos/a/retry',headers={'Origin':'https://evil.test'}).status_code==403
    assert client.get('/api/settings',headers={'Host':'evil.test'}).status_code==403
    assert 'api_key' not in client.get('/api/settings').text

def test_chat_citations_are_validated(monkeypatch,video):
    monkeypatch.setattr(chat,'context_for',lambda *args:[{'evidence_id':0,'start':12,'end':20,'text':'evidence'}])
    monkeypatch.setattr(llm.client,'structured',lambda *args:llm.Answer(answer='Grounded.',evidence_ids=[0]))
    result=chat.answer(video,'Why?')
    assert result['citations'][0]['start']==12
    assert len(db.history('a'))==2
    monkeypatch.setattr(llm.client,'structured',lambda *args:llm.Answer(answer='Bad.',evidence_ids=[9]))
    with pytest.raises(media.ProcessingError): chat.answer(video,'Why?')
    assert len(db.history('a'))==2

def test_pipeline_persists_and_resumes(monkeypatch,video,tmp_path):
    monkeypatch.setattr(pipeline,'MEDIA',tmp_path)
    db.update('a',transcript=[{'start':0,'end':10,'text':'A useful video about software testing.'}])
    monkeypatch.setattr(vectors,'embed',lambda texts:np.ones((len(texts),3)))
    stored=[]
    monkeypatch.setattr(vectors,'store',lambda *args:stored.append(1))
    monkeypatch.setattr(pipeline,'analyze',lambda _:(_ for _ in ()).throw(media.ProcessingError('No key')))
    pipeline.process('a')
    partial=db.get('a')
    assert partial['status']=='failed' and partial['embedded']==1 and partial['ml']['num_clusters']==1
    monkeypatch.setattr(pipeline,'analyze',lambda _: {'overview':'A video about testing.'})
    pipeline.process('a')
    assert db.get('a')['status']=='ready' and len(stored)==1

def test_hierarchical_analysis_and_real_timestamps(monkeypatch,video):
    chunks=[{'chunk_id':i,'video_id':'a','start':i*60+3,'end':i*60+58,'text':('topic detail '*200),'cluster_id':i%2} for i in range(18)]
    ml={'topics':[{'cluster_id':0,'label':None,'representative_chunk_ids':[0,2]},{'cluster_id':1,'label':None,'representative_chunk_ids':[1,3]}]}
    video.update(chunks=chunks,ml=ml)
    calls=[]
    def complete(system,payload):
        data=json.loads(payload)
        calls.append(data)
        if '"title": "Labels"' in system:
            return json.dumps({'topics':[{'cluster_id':t['cluster_id'],'label':f'Topic {t["cluster_id"]}'} for t in data]})
        if '"title": "Digest"' in system:
            return json.dumps({'summary':'Sections explain two recurring ideas, with transitions at chunks 0, 1, 2, and 3.'})
        return json.dumps({'overview':'Two ideas are discussed.','detailed_summary':[{'title':'Ideas','content':'A discussion.'}], 'key_takeaways':['An idea.'],'study_notes':[{'title':'Definition','content':'An explanation.'}], 'chapters':[{'chunk_id':3,'title':'Later topic'},{'chunk_id':0,'title':'Introduction'}], 'important_moments':[{'chunk_id':1,'title':'Key point'}], 'topics':['Two ideas'],'entities':[]})
    monkeypatch.setattr(llm.client,'complete',complete)
    result=llm.analyze(video)
    assert [c['start'] for c in result['chapters']]==[3,183]
    assert result['important_moments'][0]['start']==63
    assert len(calls)>3  # representatives, multiple section summaries, final synthesis
    assert all(len(json.dumps(c))<30000 for c in calls)
    assert db.get('a')['ml']['topics'][0]['label']=='Topic 0'
    count=len(calls)
    assert llm.analyze(video)==result and len(calls)==count

@pytest.mark.parametrize('status,message',[(401,'API key'),(402,'credit'),(429,'rate limit'),(503,'HTTP 503')])
def test_provider_errors(monkeypatch,status,message):
    import httpx
    monkeypatch.setenv('OPENROUTER_API_KEY','test-only')
    monkeypatch.setattr(httpx,'post',lambda *a,**k:httpx.Response(status,json={'error':'test'}))
    monkeypatch.setattr(llm.time,'sleep',lambda _:None)
    with pytest.raises(media.ProcessingError,match=message): llm.client.complete('JSON','test')
