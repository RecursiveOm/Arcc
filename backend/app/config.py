import os
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / 'backend' / '.env')
DATA = Path(os.getenv('ARC_DATA_DIR', str(ROOT / 'data'))).resolve()
DATA.mkdir(parents=True, exist_ok=True)
MEDIA = DATA / 'media'
MEDIA.mkdir(exist_ok=True)
MAX_UPLOAD = int(os.getenv('MAX_UPLOAD_MB', '1024')) * 1024 * 1024
