import sys
from pathlib import Path
import pytest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from app import db

@pytest.fixture(autouse=True)
def isolated_db(tmp_path, monkeypatch):
    monkeypatch.setattr(db,'DB_PATH',tmp_path/'test.sqlite3')
    db.init()

@pytest.fixture
def video():
    db.insert({'id':'a','source_key':'upload:abc','source_type':'upload','title':'Test'})
    return db.get('a')
