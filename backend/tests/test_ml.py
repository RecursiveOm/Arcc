import numpy as np
import pytest
from app.ml import discover_topics, safe_discover

def chunks(n): return [{'chunk_id':i,'video_id':'v','start':i*20,'end':i*20+19,'text':f'section {i}'} for i in range(n)]

def test_kmeans_silhouette_pca_representatives():
    rng=np.random.default_rng(42)
    x=np.vstack([rng.normal(-3,.1,(8,12)),rng.normal(3,.1,(8,12))])
    c=chunks(len(x))
    result=discover_topics(c,x)
    assert 2<=result['num_clusters']<=8
    assert result['num_clusters']==2 and result['silhouette_score']>.9
    assert len(result['points'])==len(x)
    for p,chunk in zip(result['points'],c):
        assert p['start']==chunk['start'] and p['end']==chunk['end']
        assert p['cluster_id']==chunk['cluster_id']
        assert np.isfinite([p['x'],p['y']]).all()
    for topic in result['topics']:
        assert all(c[i]['cluster_id']==topic['cluster_id'] for i in topic['representative_chunk_ids'])
    assert result==discover_topics(chunks(len(x)),x)

@pytest.mark.parametrize('n',[1,2,3])
def test_short_videos(n):
    result=discover_topics(chunks(n),np.ones((n,5)))
    assert result['num_clusters']==1 and result['silhouette_score'] is None
    assert len(result['points'])==n

def test_bad_matrix_does_not_corrupt():
    c=chunks(3)
    result=safe_discover(c,np.array([[np.nan,0]]))
    assert result['warning'] and result['num_clusters']==0
    assert all('cluster_id' not in item for item in c)
    assert c[0]['start']==0 and c[-1]['end']==59

def test_identical_embeddings_safe():
    result=discover_topics(chunks(12),np.ones((12,5)))
    assert result['num_clusters']==1
