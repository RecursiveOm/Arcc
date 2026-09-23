from functools import lru_cache
from threading import RLock
import os
import numpy as np
from .config import DATA

lock = RLock()

@lru_cache(maxsize=1)
def model():
    from sentence_transformers import SentenceTransformer
    return SentenceTransformer(os.getenv('EMBEDDING_MODEL','sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'), device='cpu')

@lru_cache(maxsize=1)
def collection():
    import chromadb
    client = chromadb.PersistentClient(path=str(DATA / 'chroma'))
    return client.get_or_create_collection('transcript_chunks', metadata={'hnsw:space':'cosine'})

def embed(texts):
    # MiniLM accepts short token windows. Pool every window to avoid silently
    # discarding the tail of the 400–800-token retrieval chunks.
    with lock:
        m = model()
        tokenizer = m.tokenizer
        limit = m.max_seq_length - tokenizer.num_special_tokens_to_add(pair=False)
        windows, owners, weights = [], [], []
        for i, text in enumerate(texts):
            ids = tokenizer.encode(text,add_special_tokens=False,verbose=False)
            for pos in range(0,max(1,len(ids)),limit):
                window = ids[pos:pos+limit]
                windows.append(tokenizer.decode(window,skip_special_tokens=True))
                owners.append(i)
                weights.append(max(1,len(window)))
        raw = m.encode(windows, batch_size=32, normalize_embeddings=True, show_progress_bar=False)
        result = np.zeros((len(texts),raw.shape[1]),dtype=np.float32)
        for v, owner, weight in zip(raw,owners,weights): result[owner] += v*weight
        return result / np.maximum(np.linalg.norm(result,axis=1,keepdims=True),1e-12)

def store(video_id, chunks, embeddings):
    with lock:
        collection().upsert(ids=[f'{video_id}:{c["chunk_id"]}' for c in chunks],
            embeddings=np.asarray(embeddings).tolist(), documents=[c['text'] for c in chunks],
            metadatas=[{'video_id':video_id,'chunk_id':c['chunk_id'],'start':c['start'],'end':c['end']} for c in chunks])

def retrieve(video_id, question, chunks, top_k=5):
    vector = embed([question])[0].tolist()
    with lock:
        result = collection().query(query_embeddings=[vector],where={'video_id':video_id},n_results=min(top_k,len(chunks)))
    ids = [int(m['chunk_id']) for m in result['metadatas'][0] if m['video_id']==video_id]
    selected = list(dict.fromkeys(ids))
    # Cap neighbors and total context size. Never fall back to another video's vectors.
    for i in ids[:2]:
        for neighbor in (i-1,i+1):
            if 0<=neighbor<len(chunks) and neighbor not in selected and len(selected)<7: selected.append(neighbor)
    return [chunks[i] for i in selected if chunks[i]['video_id']==video_id]

def delete(video_id):
    with lock: collection().delete(where={'video_id':video_id})
