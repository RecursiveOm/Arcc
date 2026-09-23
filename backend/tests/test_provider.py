import json
import httpx
import pytest
from fastapi.testclient import TestClient
from app import llm
from app.main import app
from app.media import ProcessingError

@pytest.fixture(autouse=True)
def env(monkeypatch):
    for key in ('LLM_BASE_URL','LLM_MODEL','LLM_FALLBACK_MODEL','LLM_API_KEY'):
        monkeypatch.delenv(key,raising=False)
    monkeypatch.setenv('OPENROUTER_API_KEY','secret-test-key')


def reply(content='{"summary":"OK"}'):
    return httpx.Response(200,json={'model':'actual/free-model','choices':[{'message':{'content':content}}]})


def transport(monkeypatch, responses):
    calls=[]
    def post(url,**kwargs):
        calls.append((url,kwargs))
        return responses.pop(0)
    monkeypatch.setattr(httpx,'post',post)
    return calls


def test_defaults_success_and_no_key_leakage(monkeypatch,caplog):
    calls=transport(monkeypatch,[reply()])
    with caplog.at_level('INFO'):
        assert llm.client.structured(llm.Digest,'Summarize',{}).summary=='OK'
    url,args=calls[0]
    assert url=='https://openrouter.ai/api/v1/chat/completions'
    assert args['json']['model']=='openrouter/free'
    assert args['json']['response_format']=={'type':'json_object'}
    assert args['headers']['Authorization']=='Bearer secret-test-key'
    assert args['json']['max_tokens']==6000
    assert args['json']['reasoning']=={'enabled':False}
    settings=TestClient(app).get('/api/settings')
    assert settings.json()['deepseek_configured']
    assert 'secret-test-key' not in settings.text+caplog.text
    assert 'actual/free-model' in caplog.text


def test_config_and_cache(monkeypatch,video):
    calls=transport(monkeypatch,[reply(),reply()])
    def request(): return llm.client.structured(llm.Digest,'Summarize',{},video['id'])
    request();request()
    monkeypatch.setenv('OPENROUTER_API_KEY','rotated-key')
    request()
    assert len(calls)==1
    monkeypatch.setenv('LLM_BASE_URL','https://custom.example/v1/')
    monkeypatch.setenv('LLM_MODEL','custom-model')
    monkeypatch.setenv('LLM_API_KEY','custom-key')
    request()
    assert calls[-1][0]=='https://custom.example/v1/chat/completions'
    assert calls[-1][1]['json']['model']=='custom-model'
    assert calls[-1][1]['headers']['Authorization']=='Bearer custom-key'


def test_one_json_repair(monkeypatch):
    calls=transport(monkeypatch,[reply('bad'),reply()])
    assert llm.client.structured(llm.Digest,'Summarize',{}).summary=='OK'
    assert len(calls)==2
    assert 'last response did not match' in calls[-1][1]['json']['messages'][-1]['content']


def test_bad_json_stops_after_repair(monkeypatch):
    calls=transport(monkeypatch,[reply('bad'),reply('bad')])
    with pytest.raises(ProcessingError,match='twice'): llm.client.structured(llm.Digest,'Summarize',{})
    assert len(calls)==2


def test_401_no_retry_or_fallback(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(401)])
    with pytest.raises(ProcessingError,match='API key'): llm.client.complete('JSON','test')
    assert len(calls)==1


def test_retry_after_and_single_free_fallback(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(429,headers={'Retry-After':'3'}),httpx.Response(503),reply()])
    waits=[];monkeypatch.setattr(llm.time,'sleep',waits.append)
    llm.client.complete('JSON','test')
    assert waits==[3,2]
    assert 'response_format' not in calls[-1][1]['json']
    assert [c[1]['json']['model'] for c in calls]==['openrouter/free','openrouter/free','nvidia/nemotron-3-ultra-550b-a55b:free']


def test_long_cooldown_no_early_retry(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(429,headers={'Retry-After':'120'})])
    with pytest.raises(ProcessingError,match='cooldown'): llm.client.complete('JSON','test')
    assert len(calls)==1


def test_capability_failure_goes_directly_to_fallback(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(404),reply()])
    monkeypatch.setattr(llm.time,'sleep',lambda _:None)
    llm.client.complete('JSON','test')
    assert len(calls)==2
    assert calls[-1][1]['json']['model'].endswith(':free')


def test_temporary_failure_bounded(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(503)]*3)
    monkeypatch.setattr(llm.time,'sleep',lambda _:None)
    with pytest.raises(ProcessingError,match='HTTP 503'): llm.client.complete('JSON','test')
    assert len(calls)==3


def test_paid_fallback_never_called(monkeypatch):
    calls=transport(monkeypatch,[])
    monkeypatch.setenv('LLM_FALLBACK_MODEL','paid/model')
    with pytest.raises(ProcessingError,match='paid fallback'): llm.client.complete('JSON','test')
    assert not calls


def test_markdown_json_is_parsed_without_extra_call(monkeypatch):
    calls=transport(monkeypatch,[reply('```json\n{"summary":"OK"}\n```')])
    assert llm.client.structured(llm.Digest,'Summarize',{}).summary=='OK'
    assert len(calls)==1


def test_upstream_error_in_200_gets_free_fallback(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(200,json={'error':{'code':503}}),httpx.Response(200,json={'error':{'code':503}}),reply()])
    monkeypatch.setattr(llm.time,'sleep',lambda _:None)
    assert llm.client.complete('JSON','test')
    assert len(calls)==3


def test_schema_repair_uses_free_fallback_once(monkeypatch):
    calls=transport(monkeypatch,[reply('User Safety: safe'),reply()])
    assert llm.client.structured(llm.Digest,'Summarize',{}).summary=='OK'
    assert [c[1]['json']['model'] for c in calls]==['openrouter/free','nvidia/nemotron-3-ultra-550b-a55b:free']


def test_empty_primary_skips_duplicate_and_falls_back(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(200,json={'choices':[]}),reply()])
    assert llm.client.complete('JSON','test')
    assert len(calls)==2 and calls[-1][1]['json']['model'].endswith(':free')


def test_mandatory_reasoning_uses_existing_primary_retry(monkeypatch):
    calls=transport(monkeypatch,[httpx.Response(400,json={'error':{'message':'Reasoning is mandatory for this endpoint and cannot be disabled.'}}),reply()])
    assert llm.client.structured(llm.Digest,'Summarize',{}).summary=='OK'
    assert len(calls)==2
    assert calls[0][1]['json']['reasoning']=={'enabled':False}
    assert calls[1][1]['json']['reasoning']=={'effort':'low'}
    assert all(c[1]['json']['model']=='openrouter/free' for c in calls)
