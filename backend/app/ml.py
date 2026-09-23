import logging
import numpy as np
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.decomposition import PCA

log = logging.getLogger(__name__)

def discover_topics(chunks, vectors):
    x = np.asarray(vectors, dtype=np.float32)
    n = len(chunks)
    if x.ndim != 2 or len(x) != n or n == 0 or not np.isfinite(x).all():
        raise ValueError('Invalid embedding matrix')
    unique = len(np.unique(x,axis=0))
    labels, centers, best, chosen = np.zeros(n,dtype=int), x.mean(axis=0,keepdims=True), None, 1
    upper = min(8, n-1, max(2, n//2), unique)
    if n >= 4 and unique >= 2:
        for k in range(2, upper+1):
            model = KMeans(n_clusters=k, n_init=10, random_state=42).fit(x)
            if len(set(model.labels_)) < 2: continue
            score = float(silhouette_score(x,model.labels_,sample_size=min(n,1000),random_state=42))
            if best is None or score > best:
                labels, centers, best, chosen = model.labels_, model.cluster_centers_, score, k
    points = PCA(n_components=2,random_state=42).fit_transform(x) if n>=2 and x.shape[1]>=2 and unique>1 else np.zeros((n,2))
    topics = []
    for k in range(chosen):
        members = np.flatnonzero(labels==k)
        nearest = members[np.argsort(np.linalg.norm(x[members]-centers[k],axis=1))[:3]]
        topics.append({'cluster_id':k, 'label':None, 'representative_chunk_ids':[chunks[i]['chunk_id'] for i in nearest]})
    for i, chunk in enumerate(chunks):
        chunk['cluster_id'] = int(labels[i])
    return {'algorithm':'kmeans', 'num_clusters':chosen, 'silhouette_score':best, 'topics':topics,
            'points':[{'chunk_id':c['chunk_id'], 'start':c['start'], 'end':c['end'], 'cluster_id':int(labels[i]), 'x':float(points[i,0]),'y':float(points[i,1])} for i,c in enumerate(chunks)]}

def safe_discover(chunks, vectors):
    try:
        return discover_topics(chunks, vectors)
    except Exception:
        log.exception('Topic clustering failed; transcript analysis can continue')
        for c in chunks: c.pop('cluster_id',None)
        return {'algorithm':'kmeans','num_clusters':0,'silhouette_score':None,'topics':[],'points':[], 'warning':'Topic clustering failed. Transcript, summary and chat remain available.'}
