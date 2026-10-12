"""
PostgreSQL-backed media upload and file management service.

Files are stored in the media.file_data BYTEA column so uploads survive Render
instance restarts and deploys.
"""

from contextlib import contextmanager
from pathlib import Path
import hashlib
import logging
import mimetypes
import os
import uuid

from psycopg2 import Binary
from werkzeug.utils import secure_filename

from database import get_db_connection

logger = logging.getLogger(__name__)

UPLOAD_FOLDER = Path(__file__).resolve().parent.parent / "uploads"
ALLOWED_EXTENSIONS = {
    "pdf", "doc", "docx", "txt", "csv", "xlsx", "xls",
    "jpg", "jpeg", "png", "gif", "webp",
    "mp4", "avi", "mov", "mkv",
}
MAX_FILE_SIZE = 50 * 1024 * 1024
_MEDIA_SCHEMA_READY = False


@contextmanager
def _connection_scope(connection=None):
    if connection is not None:
        yield connection
    else:
        with get_db_connection() as conn:
            yield conn


def _normalize_user_type(user_type):
    normalized = (user_type or "").strip().lower()
    if normalized in {"admin", "faculty", "student"}:
        return normalized
    return "student"


def _serialize_datetime(value):
    return value.isoformat() if hasattr(value, "isoformat") else value


def _file_extension(filename):
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[1].lower()


def _resolve_owner(cur, user_id, user_type, institution_id=None):
    user_type = _normalize_user_type(user_type)
    owner = {
        "uploaded_by_user_id": user_id,
        "uploader_role": user_type,
        "student_id": None,
        "faculty_id": user_id if user_type == "faculty" else None,
        "institution_id": institution_id,
    }

    if user_type == "student":
        query = "SELECT id, institution_id FROM students WHERE user_id = %s"
        params = [user_id]
        if institution_id is not None:
            query += " AND institution_id = %s"
            params.append(institution_id)
        query += " ORDER BY id ASC LIMIT 1"
        cur.execute(query, tuple(params))
        row = cur.fetchone()
        if row:
            owner["student_id"] = row[0]
            owner["institution_id"] = row[1] if row[1] is not None else institution_id
        return owner

    cur.execute("SELECT institution_id FROM users WHERE id = %s", (user_id,))
    row = cur.fetchone()
    if row and row[0] is not None:
        owner["institution_id"] = row[0]
    return owner


def ensure_media_table(connection=None):
    """Create and harden the media tables used for uploads and downloads."""
    global _MEDIA_SCHEMA_READY
    if _MEDIA_SCHEMA_READY:
        return

    with _connection_scope(connection) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS media (
                    id SERIAL PRIMARY KEY,
                    file_id UUID UNIQUE NOT NULL,
                    student_id INTEGER,
                    faculty_id INTEGER,
                    uploaded_by_user_id INTEGER,
                    uploader_role VARCHAR(20),
                    institution_id INTEGER,
                    original_filename VARCHAR(255) NOT NULL,
                    stored_filename VARCHAR(255) NOT NULL,
                    file_type VARCHAR(50),
                    file_size INTEGER,
                    mime_type VARCHAR(100),
                    file_data BYTEA,
                    content_sha256 CHAR(64),
                    upload_path TEXT,
                    description TEXT,
                    is_public BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS uploaded_by_user_id INTEGER")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS uploader_role VARCHAR(20)")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS institution_id INTEGER")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS file_data BYTEA")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64)")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS description TEXT")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE")
            cur.execute("ALTER TABLE media ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

            cur.execute("ALTER TABLE media DROP CONSTRAINT IF EXISTS media_user_check")
            cur.execute("ALTER TABLE media DROP CONSTRAINT IF EXISTS media_student_id_fkey")
            cur.execute("ALTER TABLE media DROP CONSTRAINT IF EXISTS media_faculty_id_fkey")
            cur.execute("ALTER TABLE media DROP CONSTRAINT IF EXISTS media_uploaded_by_user_id_fkey")
            cur.execute("ALTER TABLE media DROP CONSTRAINT IF EXISTS media_institution_id_fkey")

            cur.execute(
                """
                UPDATE media m
                SET uploaded_by_user_id = COALESCE(m.uploaded_by_user_id, s.user_id),
                    institution_id = COALESCE(m.institution_id, s.institution_id),
                    uploader_role = COALESCE(m.uploader_role, 'student')
                FROM students s
                WHERE m.student_id = s.id
                """
            )
            cur.execute(
                """
                UPDATE media m
                SET uploaded_by_user_id = COALESCE(m.uploaded_by_user_id, m.faculty_id),
                    institution_id = COALESCE(m.institution_id, u.institution_id),
                    uploader_role = COALESCE(m.uploader_role, 'faculty')
                FROM users u
                WHERE m.faculty_id = u.id
                """
            )

            cur.execute(
                """
                DO $$
                BEGIN
                    ALTER TABLE media
                    ADD CONSTRAINT media_student_id_fkey
                    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END
                $$;
                """
            )
            cur.execute(
                """
                DO $$
                BEGIN
                    ALTER TABLE media
                    ADD CONSTRAINT media_faculty_id_fkey
                    FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END
                $$;
                """
            )
            cur.execute(
                """
                DO $$
                BEGIN
                    ALTER TABLE media
                    ADD CONSTRAINT media_uploaded_by_user_id_fkey
                    FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END
                $$;
                """
            )
            cur.execute(
                """
                DO $$
                BEGIN
                    ALTER TABLE media
                    ADD CONSTRAINT media_institution_id_fkey
                    FOREIGN KEY (institution_id) REFERENCES institutions(id) ON DELETE SET NULL;
                EXCEPTION
                    WHEN duplicate_object THEN NULL;
                END
                $$;
                """
            )

            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_file_id ON media(file_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_student_id ON media(student_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_faculty_id ON media(faculty_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_uploaded_by_user_id ON media(uploaded_by_user_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_institution_id ON media(institution_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_media_is_public ON media(is_public)")

    _MEDIA_SCHEMA_READY = True


def is_file_allowed(filename):
    return bool(filename and "." in filename and _file_extension(filename) in ALLOWED_EXTENSIONS)


def validate_file(file_obj):
    if not file_obj or file_obj.filename == "":
        return False, "No file provided"

    if not is_file_allowed(file_obj.filename):
        return False, f"File type not allowed. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"

    file_obj.seek(0, os.SEEK_END)
    file_size = file_obj.tell()
    file_obj.seek(0)

    if file_size == 0:
        return False, "File is empty"
    if file_size > MAX_FILE_SIZE:
        return False, f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB"

    return True, None


def save_file(file_obj, user_id=None, user_type="student", description="", institution_id=None):
    """Store an uploaded file directly in PostgreSQL."""
    is_valid, error = validate_file(file_obj)
    if not is_valid:
        return {"success": False, "error": error}

    original_filename = secure_filename(file_obj.filename) or "upload"
    file_ext = _file_extension(original_filename)
    file_id = uuid.uuid4()
    stored_filename = f"{file_id}.{file_ext}" if file_ext else str(file_id)
    mime_type = mimetypes.guess_type(original_filename)[0] or "application/octet-stream"

    file_obj.seek(0)
    file_bytes = file_obj.read()
    file_size = len(file_bytes)
    content_sha256 = hashlib.sha256(file_bytes).hexdigest()

    try:
        with _connection_scope() as conn:
            ensure_media_table(conn)
            with conn.cursor() as cur:
                owner = _resolve_owner(cur, user_id, user_type, institution_id=institution_id)
                cur.execute(
                    """
                    INSERT INTO media (
                        file_id, student_id, faculty_id, uploaded_by_user_id,
                        uploader_role, institution_id, original_filename,
                        stored_filename, file_type, file_size, mime_type,
                        file_data, content_sha256, upload_path, description
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NULL, %s)
                    """,
                    (
                        str(file_id),
                        owner["student_id"],
                        owner["faculty_id"],
                        owner["uploaded_by_user_id"],
                        owner["uploader_role"],
                        owner["institution_id"],
                        original_filename,
                        stored_filename,
                        file_ext,
                        file_size,
                        mime_type,
                        Binary(file_bytes),
                        content_sha256,
                        description or None,
                    ),
                )

        logger.info("File uploaded to PostgreSQL: %s by %s %s", stored_filename, user_type, user_id)
        return {
            "success": True,
            "file_id": str(file_id),
            "filename": original_filename,
            "size": file_size,
            "type": file_ext,
            "mime_type": mime_type,
            "description": description or "",
        }
    except Exception as exc:
        logger.error("File upload failed: %s", exc)
        return {"success": False, "error": str(exc)}


def _access_filter(user_type, user_id, institution_id=None, is_super_admin=False):
    params = [user_id]
    filters = ["uploaded_by_user_id = %s"]

    if user_type == "student":
        filters.append("student_id = (SELECT id FROM students WHERE user_id = %s LIMIT 1)")
        params.append(user_id)
    elif user_type == "faculty":
        filters.append("faculty_id = %s")
        params.append(user_id)

    public_filter = "is_public = TRUE"
    if institution_id is not None and not is_super_admin:
        public_filter = "(is_public = TRUE AND (institution_id = %s OR institution_id IS NULL))"
        params.append(institution_id)
    filters.append(public_filter)

    if is_super_admin:
        filters.append("TRUE")

    return " OR ".join(f"({item})" for item in filters), params


def get_file_by_id(file_id, user_id=None, user_type="student", institution_id=None, is_super_admin=False, include_data=False):
    """Retrieve file metadata, and optionally bytes, if the caller can access it."""
    try:
        user_type = _normalize_user_type(user_type)
        where_sql, params = _access_filter(user_type, user_id, institution_id, is_super_admin)
        select_data = ", file_data" if include_data else ""

        with _connection_scope() as conn:
            ensure_media_table(conn)
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    SELECT id, file_id, original_filename, stored_filename,
                           file_type, file_size, mime_type, upload_path,
                           created_at, is_public, description, uploaded_by_user_id,
                           uploader_role, institution_id, content_sha256{select_data}
                    FROM media
                    WHERE file_id = %s AND ({where_sql})
                    """,
                    (file_id, *params),
                )
                row = cur.fetchone()

        if not row:
            return None

        result = {
            "id": row[0],
            "file_id": str(row[1]),
            "original_filename": row[2],
            "stored_filename": row[3],
            "file_type": row[4],
            "file_size": row[5],
            "mime_type": row[6],
            "upload_path": row[7],
            "created_at": _serialize_datetime(row[8]),
            "is_public": row[9],
            "description": row[10] or "",
            "uploaded_by_user_id": row[11],
            "uploader_role": row[12],
            "institution_id": row[13],
            "content_sha256": row[14],
        }
        if include_data:
            data = row[15]
            result["file_data"] = data.tobytes() if hasattr(data, "tobytes") else data
        return result
    except Exception as exc:
        logger.error("Error retrieving file: %s", exc)
        return None


def list_user_files(user_id, user_type="student", limit=50, offset=0, institution_id=None):
    """List files uploaded by a user."""
    try:
        with _connection_scope() as conn:
            ensure_media_table(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, file_id, original_filename, file_type,
                           file_size, created_at, is_public, description,
                           mime_type, content_sha256
                    FROM media
                    WHERE uploaded_by_user_id = %s
                      AND (%s::INTEGER IS NULL OR institution_id = %s OR institution_id IS NULL)
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, institution_id, institution_id, limit, offset),
                )
                rows = cur.fetchall()

        return [
            {
                "id": row[0],
                "file_id": str(row[1]),
                "filename": row[2],
                "type": row[3],
                "size": row[4],
                "created_at": _serialize_datetime(row[5]),
                "is_public": row[6],
                "description": row[7] or "",
                "mime_type": row[8],
                "content_sha256": row[9],
                "download_url": f"/media/{row[1]}",
            }
            for row in rows
        ]
    except Exception as exc:
        logger.error("Error listing files: %s", exc)
        return []


def delete_file(file_id, user_id, user_type="student", institution_id=None):
    """Delete only files owned by the current user."""
    try:
        with _connection_scope() as conn:
            ensure_media_table(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    DELETE FROM media
                    WHERE file_id = %s
                      AND uploaded_by_user_id = %s
                      AND (%s::INTEGER IS NULL OR institution_id = %s OR institution_id IS NULL)
                    """,
                    (file_id, user_id, institution_id, institution_id),
                )
                deleted = cur.rowcount

        if not deleted:
            return {"success": False, "error": "File not found or access denied"}

        logger.info("File deleted from PostgreSQL: %s", file_id)
        return {"success": True}
    except Exception as exc:
        logger.error("Error deleting file: %s", exc)
        return {"success": False, "error": str(exc)}


def make_file_public(file_id, user_id, user_type="student", is_public=True, institution_id=None):
    """Toggle public access for a file owned by the current user."""
    try:
        with _connection_scope() as conn:
            ensure_media_table(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE media
                    SET is_public = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE file_id = %s
                      AND uploaded_by_user_id = %s
                      AND (%s::INTEGER IS NULL OR institution_id = %s OR institution_id IS NULL)
                    """,
                    (is_public, file_id, user_id, institution_id, institution_id),
                )
                updated = cur.rowcount

        if not updated:
            return {"success": False, "error": "File not found or access denied"}
        return {"success": True, "is_public": bool(is_public)}
    except Exception as exc:
        logger.error("Error updating file: %s", exc)
        return {"success": False, "error": str(exc)}


def _backfill_file_data_from_disk(connection=None):
    """Move any legacy local uploads into PostgreSQL when the files still exist."""
    if not UPLOAD_FOLDER.exists():
        return 0

    migrated = 0
    with _connection_scope(connection) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, upload_path
                FROM media
                WHERE file_data IS NULL
                  AND upload_path IS NOT NULL
                  AND TRIM(upload_path) <> ''
                LIMIT 100
                """
            )
            rows = cur.fetchall()

            for media_id, upload_path in rows:
                path = Path(upload_path)
                if not path.exists() or not path.is_file():
                    continue
                try:
                    resolved = path.resolve()
                    if not str(resolved).lower().startswith(str(UPLOAD_FOLDER.resolve()).lower()):
                        continue
                    file_bytes = resolved.read_bytes()
                    cur.execute(
                        """
                        UPDATE media
                        SET file_data = %s,
                            file_size = %s,
                            content_sha256 = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        """,
                        (Binary(file_bytes), len(file_bytes), hashlib.sha256(file_bytes).hexdigest(), media_id),
                    )
                    migrated += 1
                except OSError as exc:
                    logger.warning("Could not backfill media file %s: %s", media_id, exc)

    if migrated:
        logger.info("Backfilled %s legacy media files into PostgreSQL", migrated)
    return migrated


def initialize_media():
    if not _MEDIA_SCHEMA_READY:
        ensure_media_table()
        _backfill_file_data_from_disk()
