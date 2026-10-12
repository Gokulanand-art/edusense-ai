from hashlib import sha256
from pathlib import Path

from database import get_db_connection


MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"


def _load_migration(path: Path):
    # Normalize line endings so checksums stay stable across LF/CRLF checkouts.
    migration_sql = path.read_text(encoding="utf-8").replace("\r\n", "\n").replace("\r", "\n")
    normalized_checksum = sha256(migration_sql.encode("utf-8")).hexdigest()
    legacy_checksum = sha256(path.read_bytes()).hexdigest()
    return migration_sql, normalized_checksum, legacy_checksum


def _ensure_migrations_table(cur):
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename VARCHAR(255) NOT NULL UNIQUE,
            checksum VARCHAR(64) NOT NULL,
            applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def run_migrations():
    if not MIGRATIONS_DIR.exists():
        return []

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            _ensure_migrations_table(cur)
            cur.execute("SELECT filename, checksum FROM schema_migrations")
            applied = {row[0]: row[1] for row in cur.fetchall()}
            executed = []

            for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
                filename = path.name
                migration_sql, checksum, legacy_checksum = _load_migration(path)

                if filename in applied:
                    if applied[filename] == legacy_checksum and applied[filename] != checksum:
                        cur.execute(
                            """
                            UPDATE schema_migrations
                            SET checksum = %s
                            WHERE filename = %s
                            """,
                            (checksum, filename),
                        )
                        continue

                    if applied[filename] != checksum:
                        raise RuntimeError(
                            f"Migration {filename} has changed after being applied. "
                            "Create a new migration instead of editing the old one."
                        )
                    continue

                cur.execute(migration_sql)
                cur.execute(
                    """
                    INSERT INTO schema_migrations (filename, checksum)
                    VALUES (%s, %s)
                    """,
                    (filename, checksum),
                )
                executed.append(filename)

            return executed
