import numpy as np
from . import vectors, db
from .llm import client, Answer
from .transcript import range_segments, chunk_segments
from .media import ProcessingError

def context_for(video, question, start=None, end=None):
    if start is not None:
        selected = range_segments(video['transcript'],start,end)
        candidates = chunk_segments(video['id'],selected,target=400,overlap=0)
        if not candidates: return []
        embeddings = vectors.embed([question]+[c['text'] for c in candidates])
        ranked = np.argsort(-(embeddings[1:] @ embeddings[0]))[:5]
        retrieved = [candidates[i] for i in ranked]
    else:
        retrieved=vectors.retrieve(video['id'],question,video['chunks'])
    evidence=[]
    remaining=20000
    for chunk in retrieved:
        text=chunk['text'][:remaining]
        if not text: break
        evidence.append({'evidence_id':len(evidence),'start':chunk['start'],'end':chunk['end'],'text':text})
        remaining-=len(text)
    return evidence

def answer(video, question, start=None, end=None):
    evidence=context_for(video,question,start,end)
    if not evidence:
        text='The transcript does not contain enough evidence in this section to answer that question.'
        citations=[]
    else:
        # Previous turns help resolve follow-ups, but are explicitly not evidence.
        history=[{'role':m['role'],'content':m['content'][:1500]} for m in db.history(video['id'])[-6:]]
        result=client.structured(Answer,'Answer using ONLY the supplied video evidence. Say when evidence is insufficient. Distinguish speaker claims from your explanation. Prior conversation is not evidence. Return evidence_ids supporting the answer; return [] when evidence is insufficient. Do not write invented timestamp references in the answer; the UI adds validated citation chips.',{'question':question,'prior_conversation':history,'range':{'start':start,'end':end},'evidence':evidence})
        if any(i<0 or i>=len(evidence) for i in result.evidence_ids):
            raise ProcessingError('LLM provider returned an invalid citation. Please try again.')
        text=result.answer
        citations=[{'start':evidence[i]['start'],'end':evidence[i]['end'],'text':evidence[i]['text'][:220]} for i in dict.fromkeys(result.evidence_ids)]
    db.save_exchange(video['id'],question,text,citations)
    return {'role':'assistant','content':text,'citations':citations}
