import json
import os
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from .config import MEDIA

class ProcessingError(Exception):
    pass

def run(args, timeout=7200):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise ProcessingError('FFmpeg/ffprobe is missing. Install FFmpeg and restart ARC.') from None
    except subprocess.TimeoutExpired:
        raise ProcessingError('Media conversion timed out. Try a shorter video.') from None
    if result.returncode:
        raise ProcessingError('Media could not be decoded. Check that this is a valid, unprotected file with audio.')
    return result.stdout

def probe(path):
    info = json.loads(run(['ffprobe','-v','error','-show_format','-show_streams','-of','json',str(path)],60))
    if not any(s['codec_type']=='audio' for s in info['streams']):
        raise ProcessingError('This file has no audio track to transcribe.')
    return info

def download(video_id, youtube_id):
    if not shutil.which('ffmpeg'):
        raise ProcessingError('FFmpeg is missing. Install it before processing videos.')
    import yt_dlp
    folder = MEDIA / video_id
    folder.mkdir(exist_ok=True)
    try:
        with yt_dlp.YoutubeDL({'format':'bestaudio/best','outtmpl':str(folder/'source.%(ext)s'), 'noplaylist':True,
                              'quiet':True,'noprogress':True,'no_warnings':True,'socket_timeout':30,'retries':2, 'max_filesize':2*1024**3}) as ydl:
            info = ydl.extract_info(f'https://www.youtube.com/watch?v={youtube_id}',download=True)
            path = Path(ydl.prepare_filename(info))
        if not path.exists(): raise ValueError('No media downloaded')
        return path, info
    except Exception:
        raise ProcessingError('YouTube download failed. The video may be unavailable or YouTube may restrict this network. Update yt-dlp or upload a local file.') from None

def extract(path, video_id):
    audio = MEDIA / video_id / 'audio.wav'
    run(['ffmpeg','-nostdin','-y','-v','error','-i',str(path),'-vn','-ac','1','-ar','16000','-c:a','pcm_s16le',str(audio)])
    return audio

def preview(path, info):
    # Normalize uploaded media for reliable HTML5 seeking across browsers.
    video = any(s['codec_type']=='video' for s in info['streams'])
    target = path.parent / ('playback.mp4' if video else 'playback.m4a')
    args = ['ffmpeg','-nostdin','-y','-v','error','-i',str(path)]
    args += ['-map','0:v:0','-map','0:a:0','-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p'] if video else ['-vn']
    args += ['-c:a','aac','-movflags','+faststart',str(target)]
    run(args)
    return target

@lru_cache(maxsize=1)
def whisper():
    from faster_whisper import WhisperModel
    import ctranslate2
    device = os.getenv('WHISPER_DEVICE','auto')
    if device=='auto': device = 'cuda' if ctranslate2.get_cuda_device_count() else 'cpu'
    return WhisperModel(os.getenv('WHISPER_MODEL','small'),device=device,compute_type='float16' if device=='cuda' else 'int8')

def transcribe(path, progress):
    segments, info = whisper().transcribe(str(path),beam_size=5,vad_filter=True)
    result=[]
    for s in segments:
        result.append({'start':s.start,'end':s.end,'text':s.text})
        progress(f'Transcribing · {int(s.end//60)}:{int(s.end%60):02d} / {int(info.duration//60)}:{int(info.duration%60):02d}')
    if not result: raise ProcessingError('No speech was detected in this file.')
    return result, info.language, info.duration
