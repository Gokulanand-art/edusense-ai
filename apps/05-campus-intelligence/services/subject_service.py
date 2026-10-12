from database import get_db_connection
from services.institution_service import get_default_institution
from services.student_service import ensure_department_table_consistency, require_department_exists

_SUBJECT_SCHEMA_READY = False


def _resolve_institution_id(connection, institution_id=None):
    if institution_id is not None:
        return institution_id

    institution = get_default_institution(connection=connection)
    return institution["id"] if institution else None


def normalize_subject_name(name):
    cleaned_name = " ".join((name or "").strip().split())
    if not cleaned_name:
        raise ValueError("Subject name is required")
    return cleaned_name


def normalize_subject_code(code):
    cleaned_code = "".join((code or "").strip().upper().split())
    if not cleaned_code:
        raise ValueError("Subject code is required")
    return cleaned_code


def ensure_subject_table_consistency(connection=None):
    global _SUBJECT_SCHEMA_READY

    if _SUBJECT_SCHEMA_READY:
        return

    def apply_schema(conn):
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS subjects (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(150) NOT NULL,
                    code VARCHAR(50) UNIQUE NOT NULL,
                    department VARCHAR(100) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS name VARCHAR(150)")
            cur.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS code VARCHAR(50)")
            cur.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS department VARCHAR(100)")
            cur.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS institution_id INTEGER")
            cur.execute("ALTER TABLE subjects ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

            cur.execute(
                """
                INSERT INTO departments (name)
                SELECT DISTINCT TRIM(department)
                FROM subjects
                WHERE department IS NOT NULL AND TRIM(department) <> ''
                ON CONFLICT (name) DO NOTHING
                """
            )

            cur.execute("ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_department_fkey")
            cur.execute(
                """
                ALTER TABLE subjects
                ADD CONSTRAINT subjects_department_fkey
                FOREIGN KEY (department) REFERENCES departments(name)
                ON UPDATE CASCADE
                ON DELETE RESTRICT
                """
            )

    if connection is not None:
        apply_schema(connection)
    else:
        with get_db_connection() as conn:
            apply_schema(conn)

    _SUBJECT_SCHEMA_READY = True


def create_subject(name, code, department, institution_id=None):
    cleaned_name = normalize_subject_name(name)
    cleaned_code = normalize_subject_code(code)

    with get_db_connection() as conn:
        ensure_subject_table_consistency(conn)
        scoped_institution_id = _resolve_institution_id(conn, institution_id)
        department_record = require_department_exists(department, conn, institution_id=scoped_institution_id)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM subjects
                WHERE institution_id = %s AND UPPER(code) = %s
                """,
                (scoped_institution_id, cleaned_code),
            )
            existing = cur.fetchone()

            if existing:
                raise ValueError(f"Subject code {cleaned_code} already exists")

            cur.execute(
                """
                INSERT INTO subjects (name, code, department, institution_id)
                VALUES (%s, %s, %s, %s)
                """,
                (cleaned_name, cleaned_code, department_record["name"], scoped_institution_id),
            )


def get_all_subjects(institution_id=None):
    with get_db_connection() as conn:
        ensure_subject_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT id, name, code, department
                FROM subjects
                WHERE institution_id = %s
                ORDER BY department ASC, name ASC, id ASC
                """,
                (scoped_institution_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "name": row[1],
            "code": row[2],
            "department": row[3],
        }
        for row in rows
    ]


def get_subject_by_id(subject_id, institution_id=None):
    with get_db_connection() as conn:
        ensure_subject_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT id, name, code, department
                FROM subjects
                WHERE id = %s AND institution_id = %s
                """,
                (subject_id, scoped_institution_id),
            )
            row = cur.fetchone()

    if not row:
        return None

    return {
        "id": row[0],
        "name": row[1],
        "code": row[2],
        "department": row[3],
    }


def delete_subject(subject_id, institution_id=None):
    with get_db_connection() as conn:
        ensure_subject_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT id, name, code
                FROM subjects
                WHERE id = %s AND institution_id = %s
                """,
                (subject_id, scoped_institution_id),
            )
            subject = cur.fetchone()

            if not subject:
                raise ValueError("Subject not found")

            cur.execute("DELETE FROM attendance WHERE subject_id = %s", (subject_id,))
            cur.execute("DELETE FROM marks WHERE subject_id = %s", (subject_id,))
            cur.execute("DELETE FROM subjects WHERE id = %s AND institution_id = %s", (subject_id, scoped_institution_id))

    return {
        "id": subject[0],
        "name": subject[1],
        "code": subject[2],
    }
