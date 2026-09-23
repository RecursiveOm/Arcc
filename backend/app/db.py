import json
import sqlite3
from contextlib import contextmanager
from .config import DATA

DB_PATH = DATA / 'arc.sqlite3'
JSON_FIELDS = {'transcript', 'chunks', 'analysis', 'ml'}

@contextmanager
def connect():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys=ON')
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def init():
    with connect() as c:
        c.execute('PRAGMA journal_mode=WAL')
        c.executescript('''
        CREATE TABLE IF NOT EXISTS videos (
          id TEXT PRIMARY KEY, source_key TEXT UNIQUE NOT NULL, source_type TEXT NOT NULL,
          title TEXT NOT NULL, youtube_id TEXT, filename TEXT, file_size INTEGER,
          duration REAL, language TEXT, media_path TEXT, thumbnail TEXT,
          status TEXT NOT NULL DEFAULT 'queued', stage TEXT NOT NULL DEFAULT 'Queued', error TEXT,
          created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
          transcript TEXT, chunks TEXT, ml TEXT, analysis TEXT, embedded INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY, video_id TEXT REFERENCES videos(id) ON DELETE CASCADE,
          role TEXT NOT NULL, content TEXT NOT NULL, citations TEXT NOT NULL DEFAULT '[]',
          created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE TABLE IF NOT EXISTS llm_cache (
          video_id TEXT REFERENCES videos(id) ON DELETE CASCADE, cache_key TEXT,
          value TEXT NOT NULL, PRIMARY KEY(video_id, cache_key)
        );
        ''')
        c.execute("UPDATE videos SET status='failed', stage='Interrupted', error='Processing was interrupted. Retry to resume saved progress.' WHERE status IN ('processing','queued')")

def decode(row):
    if row is None:
        return None
    obj = dict(row)
    for k in JSON_FIELDS:
        if obj.get(k) is not None:
            obj[k] = json.loads(obj[k])
    return obj

def get(video_id):
    with connect() as c:
        return decode(c.execute('SELECT * FROM videos WHERE id=?', (video_id,)).fetchone())

def duplicate(key):
    with connect() as c:
        return decode(c.execute('SELECT * FROM videos WHERE source_key=?', (key,)).fetchone())

def insert(values):
    with connect() as c:
        cols = ','.join(values)
        c.execute(f"INSERT INTO videos ({cols}) VALUES ({','.join('?' for _ in values)})", tuple(values.values()))

def update(video_id, **values):
    allowed = {'title','duration','language','media_path','thumbnail','status','stage','error','embedded'} | JSON_FIELDS
    if not set(values) <= allowed:
        raise ValueError('Invalid database field')
    vals = [json.dumps(v, ensure_ascii=False) if k in JSON_FIELDS else v for k, v in values.items()]
    with connect() as c:
        c.execute(f"UPDATE videos SET {','.join(k+'=?' for k in values)} WHERE id=?", (*vals, video_id))

def history(video_id):
    with connect() as c:
        return [{**dict(r), 'citations': json.loads(r['citations'])} for r in c.execute('SELECT * FROM messages WHERE video_id=? ORDER BY id', (video_id,))]

def save_exchange(video_id, question, answer, citations):
    with connect() as c:
        c.execute("INSERT INTO messages(video_id,role,content) VALUES (?,'user',?)", (video_id, question))
        c.execute("INSERT INTO messages(video_id,role,content,citations) VALUES (?,'assistant',?,?)", (video_id, answer, json.dumps(citations)))

def cache_get(video_id, key):
    with connect() as c:
        row = c.execute('SELECT value FROM llm_cache WHERE video_id=? AND cache_key=?', (video_id,key)).fetchone()
        return json.loads(row[0]) if row else None

def cache_put(video_id, key, value):
    with connect() as c:
        c.execute('INSERT OR REPLACE INTO llm_cache VALUES (?,?,?)', (video_id,key,json.dumps(value)))
