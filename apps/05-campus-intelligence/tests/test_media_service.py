from contextlib import contextmanager
from io import BytesIO

from werkzeug.datastructures import FileStorage

import services.media_service as media_service


class MediaCursor:
    def __init__(self, db):
        self.db = db
        self.rows = []
        self.rowcount = 0

    def execute(self, query, params=None):
        compact = " ".join(query.split())
        self.db.queries.append((compact, params))

        if compact.startswith("SELECT id, institution_id FROM students"):
            self.rows = [(11, 2)]
            return

        if compact.startswith("SELECT institution_id FROM users"):
            self.rows = [(2,)]
            return

        if compact.startswith("INSERT INTO media"):
            self.db.insert_params = params
            self.rowcount = 1
            return

        if "FROM media WHERE file_id = %s" in compact:
            self.rows = [self.db.download_row]
            return

        if "FROM media WHERE uploaded_by_user_id = %s" in compact:
            self.rows = [self.db.list_row]
            return

        self.rows = []

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False


class MediaConnection:
    def __init__(self, db):
        self.db = db

    def cursor(self):
        return MediaCursor(self.db)


class MediaDb:
    def __init__(self):
        self.queries = []
        self.insert_params = None
        self.download_row = (
            1, "00000000-0000-0000-0000-000000000001", "notes.txt", "stored.txt",
            "txt", 11, "text/plain", None, None, False, "desc", 101,
            "student", 2, "hash", memoryview(b"hello world"),
        )
        self.list_row = (
            1, "00000000-0000-0000-0000-000000000001", "notes.txt", "txt",
            11, None, False, "desc", "text/plain", "hash",
        )

    @contextmanager
    def connect(self):
        yield MediaConnection(self)


def _file_storage(name="notes.txt", content=b"hello world"):
    return FileStorage(stream=BytesIO(content), filename=name)


def test_validate_file_rejects_disallowed_extension():
    ok, error = media_service.validate_file(_file_storage("malware.exe"))

    assert not ok
    assert "File type not allowed" in error


def test_save_file_stores_bytes_in_postgres(monkeypatch):
    db = MediaDb()
    monkeypatch.setattr(media_service, "get_db_connection", db.connect)
    monkeypatch.setattr(media_service, "ensure_media_table", lambda connection=None: None)

    result = media_service.save_file(
        _file_storage(),
        user_id=101,
        user_type="student",
        description="Class notes",
        institution_id=2,
    )

    assert result["success"] is True
    assert result["filename"] == "notes.txt"
    assert db.insert_params[1] == 11
    assert db.insert_params[3] == 101
    assert db.insert_params[4] == "student"
    assert db.insert_params[5] == 2
    assert db.insert_params[11].adapted == b"hello world"


def test_get_file_by_id_returns_database_bytes(monkeypatch):
    db = MediaDb()
    monkeypatch.setattr(media_service, "get_db_connection", db.connect)
    monkeypatch.setattr(media_service, "ensure_media_table", lambda connection=None: None)

    result = media_service.get_file_by_id(
        "00000000-0000-0000-0000-000000000001",
        user_id=101,
        user_type="student",
        institution_id=2,
        include_data=True,
    )

    assert result["original_filename"] == "notes.txt"
    assert result["file_data"] == b"hello world"


def test_list_user_files_includes_download_url(monkeypatch):
    db = MediaDb()
    monkeypatch.setattr(media_service, "get_db_connection", db.connect)
    monkeypatch.setattr(media_service, "ensure_media_table", lambda connection=None: None)

    files = media_service.list_user_files(101, institution_id=2)

    assert files[0]["filename"] == "notes.txt"
    assert files[0]["download_url"] == "/media/00000000-0000-0000-0000-000000000001"
