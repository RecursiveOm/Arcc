import re
from urllib.parse import urlparse, parse_qs
from pathlib import Path

EXTENSIONS = {'.mp4', '.mov', '.webm', '.mkv', '.mp3', '.wav', '.m4a'}

def youtube_id(url: str) -> str:
    try:
        p = urlparse(url.strip())
        if p.scheme not in {'http','https'} or p.username or p.password or p.port not in {None,80,443}:
            raise ValueError()
        host = (p.hostname or '').lower()
        if host == 'youtu.be':
            value = p.path.strip('/')
        elif host in {'youtube.com','www.youtube.com','m.youtube.com','music.youtube.com'}:
            parts = p.path.strip('/').split('/')
            value = parse_qs(p.query).get('v',[''])[0] if p.path == '/watch' else parts[1] if len(parts)==2 and parts[0] in {'shorts','embed','live'} else ''
        else:
            raise ValueError()
        if not re.fullmatch(r'[A-Za-z0-9_-]{11}', value):
            raise ValueError()
        return value
    except ValueError:
        raise ValueError('Enter a public YouTube video URL (watch, shorts, or youtu.be).') from None

def validate_file(name):
    name = (name or '').replace('\\','/').split('/')[-1]
    ext = Path(name).suffix.lower()
    if ext not in EXTENSIONS:
        raise ValueError('Supported files: MP4, MOV, WebM, MKV, MP3, WAV, M4A.')
    return name[:240], ext

def clean_segments(segments):
    return [{'start': float(s['start']), 'end': float(s['end']), 'text': re.sub(r'\s+', ' ', s['text']).strip(), 'original_text': s.get('original_text',s['text'])} for s in segments if s['text'].strip() and s['end'] >= s['start']]

def token_estimate(text):
    # Conservative, language-independent approximation; no character slicing of speech.
    return max(len(re.findall(r'\w+|[^\w\s]', text)), len(text)//4, 1)

def chunk_segments(video_id, segments, target=500, overlap=60):
    chunks, pending, size = [], [], 0
    def append():
        chunks.append({'chunk_id':len(chunks), 'video_id':video_id, 'start':pending[0]['start'], 'end':pending[-1]['end'], 'text':' '.join(s['text'] for s in pending)})
    for segment in segments:
        pending.append(segment)
        size += token_estimate(segment['text'])
        if size >= target:
            append()
            carry, count = [], 0
            for s in reversed(pending[1:]):
                n = token_estimate(s['text'])
                if count+n > overlap: break
                carry.insert(0,s)
                count += n
            pending, size = carry, count
    if pending and (not chunks or pending[-1]['end'] > chunks[-1]['end']):
        append()
    return chunks

def range_segments(segments, start, end):
    # Whole utterances wholly inside the requested range: no out-of-range evidence.
    return [s for s in segments if s['start'] >= start and s['end'] <= end]
