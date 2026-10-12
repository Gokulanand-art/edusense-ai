from contextlib import nullcontext

from database import get_db_connection
from services.institution_service import get_default_institution

_DEPARTMENT_SCHEMA_READY = False
_STUDENT_SCHEMA_READY = False


class DuplicateStudentError(ValueError):
    pass


class StudentNotFoundError(ValueError):
    pass


def _connection_scope(connection=None):
    return nullcontext(connection) if connection is not None else get_db_connection()


def _table_exists(cur, table_name):
    cur.execute(
        """
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = %s
        """,
        (table_name,),
    )
    return cur.fetchone() is not None


def _resolve_institution_id(connection, institution_id=None):
    if institution_id is not None:
        return institution_id

    institution = get_default_institution(connection=connection)
    return institution["id"] if institution else None


def normalize_department_name(department):
    return " ".join((department or "").strip().split())


def normalize_roll_number(roll_number):
    cleaned_roll_number = (roll_number or "").strip().upper()
    return cleaned_roll_number


def ensure_roll_number_available(roll_number, connection=None, exclude_student_id=None, institution_id=None):
    normalized_roll_number = normalize_roll_number(roll_number)

    if not normalized_roll_number:
        return None

    with _connection_scope(connection) as conn:
        ensure_student_table_consistency(conn)

        query = """
            SELECT id
            FROM students
            WHERE institution_id = %s
              AND LOWER(COALESCE(roll_number, '')) = LOWER(%s)
        """
        params = [_resolve_institution_id(conn, institution_id), normalized_roll_number]

        if exclude_student_id is not None:
            query += " AND id <> %s"
            params.append(exclude_student_id)

        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            existing = cur.fetchone()

    if existing:
        raise ValueError(f"Roll number {normalized_roll_number} is already assigned to another student")

    return normalized_roll_number


def ensure_department_table_consistency(connection=None):
    global _DEPARTMENT_SCHEMA_READY

    if _DEPARTMENT_SCHEMA_READY:
        return

    with _connection_scope(connection) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS departments (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) UNIQUE NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE departments ADD COLUMN IF NOT EXISTS name VARCHAR(100)")
            cur.execute("ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE departments ADD COLUMN IF NOT EXISTS institution_id INTEGER")

    _DEPARTMENT_SCHEMA_READY = True


def ensure_department_exists(department, connection=None, institution_id=None):
    cleaned_department = normalize_department_name(department)

    if not cleaned_department:
        return None

    with _connection_scope(connection) as conn:
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO departments (name)
                VALUES (%s)
                ON CONFLICT (name) DO NOTHING
                RETURNING id
                """,
                (cleaned_department,),
            )
            inserted = cur.fetchone()

            if inserted is None:
                cur.execute(
                    """
                    SELECT id
                    FROM departments
                    WHERE name = %s
                    """,
                    (cleaned_department,),
                )
                inserted = cur.fetchone()

    return {
        "id": inserted[0] if inserted else None,
        "name": cleaned_department,
    }


def require_department_exists(department, connection=None):
    cleaned_department = normalize_department_name(department)

    if not cleaned_department:
        raise ValueError("Department is required")

    with _connection_scope(connection) as conn:
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name
                FROM departments
                WHERE institution_id = %s AND LOWER(name) = LOWER(%s)
                """,
                (_resolve_institution_id(conn, institution_id), cleaned_department),
            )
            existing = cur.fetchone()

    if not existing:
        raise ValueError("Select a valid department from the department list")

    return {
        "id": existing[0],
        "name": existing[1],
    }


def create_department(department, connection=None, institution_id=None):
    cleaned_department = normalize_department_name(department)

    if not cleaned_department:
        raise ValueError("Department name is required")

    with _connection_scope(connection) as conn:
        ensure_department_table_consistency(conn)

        scoped_institution_id = _resolve_institution_id(conn, institution_id)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, name
                FROM departments
                WHERE institution_id = %s AND LOWER(name) = LOWER(%s)
                """,
                (scoped_institution_id, cleaned_department),
            )
            existing = cur.fetchone()

            if existing:
                raise ValueError(f"Department {existing[1]} already exists")

            cur.execute(
                """
                INSERT INTO departments (name, institution_id)
                VALUES (%s, %s)
                RETURNING id, name
                """,
                (cleaned_department, scoped_institution_id),
            )
            created = cur.fetchone()

    return {
        "id": created[0],
        "name": created[1],
    }


def get_department_catalog(institution_id=None):
    with get_db_connection() as conn:
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            subjects_table_exists = _table_exists(cur, "subjects")

            subject_join = (
                "LEFT JOIN subjects sub ON sub.department = d.name AND sub.institution_id = d.institution_id"
                if subjects_table_exists else ""
            )
            subject_count = "COUNT(DISTINCT sub.id) AS subject_count" if subjects_table_exists else "0 AS subject_count"
            cur.execute(
                f"""
                SELECT
                    d.id,
                    d.name,
                    COUNT(DISTINCT s.id) AS student_count,
                    {subject_count}
                FROM departments d
                LEFT JOIN students s ON s.department = d.name AND s.institution_id = d.institution_id
                {subject_join}
                WHERE d.institution_id = %s
                GROUP BY d.id, d.name
                ORDER BY d.name ASC
                """,
                (scoped_institution_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "name": row[1],
            "student_count": row[2],
            "subject_count": row[3],
        }
        for row in rows
    ]


def delete_department(department_id, institution_id=None):
    with get_db_connection() as conn:
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT id, name
                FROM departments
                WHERE id = %s AND institution_id = %s
                """,
                (department_id, scoped_institution_id),
            )
            department = cur.fetchone()

            if not department:
                raise ValueError("Department not found")

            cur.execute(
                "SELECT COUNT(*) FROM students WHERE department = %s AND institution_id = %s",
                (department[1], scoped_institution_id),
            )
            student_count = cur.fetchone()[0]
            if _table_exists(cur, "subjects"):
                cur.execute(
                    "SELECT COUNT(*) FROM subjects WHERE department = %s AND institution_id = %s",
                    (department[1], scoped_institution_id),
                )
                subject_count = cur.fetchone()[0]
            else:
                subject_count = 0

            if student_count or subject_count:
                raise ValueError(
                    f"Cannot delete department {department[1]} because it is linked to "
                    f"{student_count} students and {subject_count} subjects"
                )

            cur.execute("DELETE FROM departments WHERE id = %s AND institution_id = %s", (department_id, scoped_institution_id))

    return {
        "id": department[0],
        "name": department[1],
    }


def ensure_student_table_consistency(connection=None):
    global _STUDENT_SCHEMA_READY

    if _STUDENT_SCHEMA_READY:
        return

    with _connection_scope(connection) as conn:
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS students (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100),
                    email VARCHAR(100) UNIQUE,
                    roll_number VARCHAR(50),
                    department VARCHAR(100),
                    user_id INTEGER,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
                """
            )

            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS name VARCHAR(100)")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS email VARCHAR(100)")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50)")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS department VARCHAR(100)")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS user_id INTEGER")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_id INTEGER")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")

            cur.execute(
                """
                INSERT INTO departments (name)
                SELECT DISTINCT TRIM(department)
                FROM students
                WHERE department IS NOT NULL AND TRIM(department) <> ''
                ON CONFLICT (name) DO NOTHING
                """
            )

            cur.execute("ALTER TABLE students DROP CONSTRAINT IF EXISTS students_user_id_fkey")
            cur.execute("ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_user")
            cur.execute("ALTER TABLE students DROP CONSTRAINT IF EXISTS students_department_fkey")

            if _table_exists(cur, "users"):
                cur.execute(
                    """
                    ALTER TABLE students
                    ADD CONSTRAINT students_user_id_fkey
                    FOREIGN KEY (user_id) REFERENCES users(id)
                    ON DELETE CASCADE
                    """
                )

            cur.execute(
                """
                ALTER TABLE students
                ADD CONSTRAINT students_department_fkey
                FOREIGN KEY (department) REFERENCES departments(name)
                ON UPDATE CASCADE
                ON DELETE RESTRICT
                """
            )

    _STUDENT_SCHEMA_READY = True


def sync_student_record(user_id, name, email, department, roll_number=None, connection=None, institution_id=None):
    normalized_roll_number = normalize_roll_number(roll_number)

    with _connection_scope(connection) as conn:
        scoped_institution_id = _resolve_institution_id(conn, institution_id)
        department_record = require_department_exists(department, connection=conn, institution_id=scoped_institution_id)
        ensure_student_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM students
                WHERE institution_id = %s
                  AND (user_id = %s OR LOWER(email) = LOWER(%s))
                ORDER BY id ASC
                LIMIT 1
                """,
                (scoped_institution_id, user_id, email),
            )
            existing = cur.fetchone()

            if normalized_roll_number:
                ensure_roll_number_available(
                    normalized_roll_number,
                    connection=conn,
                    exclude_student_id=existing[0] if existing else None,
                    institution_id=scoped_institution_id,
                )

            if existing:
                cur.execute(
                    """
                    UPDATE students
                    SET name = %s,
                        email = %s,
                        roll_number = COALESCE(NULLIF(%s, ''), roll_number),
                        department = %s,
                        user_id = %s,
                        institution_id = %s
                    WHERE id = %s
                    RETURNING id, roll_number
                    """,
                    (
                        name, email, normalized_roll_number,
                        department_record["name"], user_id, scoped_institution_id, existing[0],
                    ),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO students (name, email, roll_number, department, user_id, institution_id)
                    VALUES (%s, %s, NULLIF(%s, ''), %s, %s, %s)
                    RETURNING id, roll_number
                    """,
                    (name, email, normalized_roll_number, department_record["name"], user_id, scoped_institution_id),
                )

            result = cur.fetchone()
            student_id = result[0] if result else None
            saved_roll_number = result[1] if result else normalized_roll_number

    return {
        "id": student_id,
        "user_id": user_id,
        "name": name,
        "email": email,
        "roll_number": saved_roll_number,
        "department": department_record["name"],
        "institution_id": scoped_institution_id,
    }


def get_all_departments(institution_id=None):
    with get_db_connection() as conn:
        ensure_department_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT name
                FROM departments
                WHERE institution_id = %s
                ORDER BY name ASC
                """,
                (scoped_institution_id,),
            )
            rows = cur.fetchall()

    return [row[0] for row in rows]


def _student_email_exists(email, connection, exclude_student_id=None, institution_id=None):
    query = """
        SELECT id
        FROM students
        WHERE institution_id = %s
          AND LOWER(COALESCE(email, '')) = LOWER(%s)
    """
    params = [_resolve_institution_id(connection, institution_id), email]

    if exclude_student_id is not None:
        query += " AND id <> %s"
        params.append(exclude_student_id)

    with connection.cursor() as cur:
        cur.execute(query, tuple(params))
        return cur.fetchone() is not None


def _ensure_unique_student_fields(email, roll_number, connection, exclude_student_id=None, institution_id=None):
    if _student_email_exists(email, connection, exclude_student_id=exclude_student_id, institution_id=institution_id):
        raise DuplicateStudentError("Email already exists")

    try:
        ensure_roll_number_available(
            roll_number,
            connection=connection,
            exclude_student_id=exclude_student_id,
            institution_id=institution_id,
        )
    except ValueError as exc:
        raise DuplicateStudentError(str(exc)) from exc


def create_student_record(name, email, department, roll_number, institution_id=None):
    with get_db_connection() as conn:
        ensure_student_table_consistency(conn)
        scoped_institution_id = _resolve_institution_id(conn, institution_id)
        department_record = ensure_department_exists(department, connection=conn, institution_id=scoped_institution_id)
        _ensure_unique_student_fields(email, roll_number, conn, institution_id=scoped_institution_id)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO students (name, email, department, roll_number, institution_id)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
                """,
                (name, email, department_record["name"], roll_number, scoped_institution_id),
            )
            row = cur.fetchone()

    return {
        "id": row[0] if row else None,
        "name": name,
        "email": email,
        "department": department_record["name"],
        "roll_number": roll_number,
        "institution_id": scoped_institution_id,
    }


def update_student_record(student_id, name, email, department, roll_number, institution_id=None):
    with get_db_connection() as conn:
        ensure_student_table_consistency(conn)
        scoped_institution_id = _resolve_institution_id(conn, institution_id)

        with conn.cursor() as cur:
            cur.execute("SELECT id FROM students WHERE id = %s AND institution_id = %s", (student_id, scoped_institution_id))
            if not cur.fetchone():
                raise StudentNotFoundError("Student not found")

        department_record = ensure_department_exists(department, connection=conn, institution_id=scoped_institution_id)
        _ensure_unique_student_fields(email, roll_number, conn, exclude_student_id=student_id, institution_id=scoped_institution_id)

        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE students
                SET name = %s,
                    email = %s,
                    department = %s,
                    roll_number = %s,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING id
                """,
                (name, email, department_record["name"], roll_number, student_id),
            )
            row = cur.fetchone()

    return {
        "id": row[0] if row else student_id,
        "name": name,
        "email": email,
        "department": department_record["name"],
        "roll_number": roll_number,
    }


def delete_student_record(student_id, institution_id=None):
    with get_db_connection() as conn:
        ensure_student_table_consistency(conn)
        scoped_institution_id = _resolve_institution_id(conn, institution_id)

        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM students
                WHERE id = %s AND institution_id = %s
                RETURNING id, name, email, roll_number, department
                """,
                (student_id, scoped_institution_id),
            )
            row = cur.fetchone()

    if not row:
        raise StudentNotFoundError("Student not found")

    return {
        "id": row[0],
        "name": row[1],
        "email": row[2],
        "roll_number": row[3],
        "department": row[4],
    }


def fetch_all_students(institution_id=None):
    with get_db_connection() as conn:
        ensure_student_table_consistency(conn)

        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT
                    s.id,
                    COALESCE(NULLIF(s.name, ''), u.name) AS name,
                    COALESCE(NULLIF(s.email, ''), u.email) AS email,
                    COALESCE(NULLIF(s.roll_number, ''), 'Not Assigned') AS roll_number,
                    COALESCE(NULLIF(s.department, ''), 'Not Assigned') AS department
                FROM students s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.institution_id = %s
                ORDER BY s.id ASC
                """,
                (scoped_institution_id,),
            )
            rows = cur.fetchall()

    students = []
    for row in rows:
        students.append({
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "roll_number": row[3],
            "department": row[4]
        })

    return students


def get_student_record_by_user_id(user_id, institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT
                    s.id,
                    s.user_id,
                    COALESCE(NULLIF(s.name, ''), u.name) AS name,
                    COALESCE(NULLIF(s.email, ''), u.email) AS email,
                    COALESCE(NULLIF(s.roll_number, ''), 'Not Assigned') AS roll_number,
                    COALESCE(s.department, 'Not Assigned') AS department
                FROM students s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.user_id = %s AND s.institution_id = %s
                """,
                (user_id, scoped_institution_id),
            )

            row = cur.fetchone()

    if not row:
        return None

    return {
        "id": row[0],
        "user_id": row[1],
        "name": row[2],
        "email": row[3],
        "roll_number": row[4],
        "department": row[5],
    }


def get_student_profile(student_id, institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            scoped_institution_id = _resolve_institution_id(conn, institution_id)
            cur.execute(
                """
                SELECT
                    s.id,
                    s.user_id,
                    COALESCE(NULLIF(s.name, ''), u.name) AS name,
                    COALESCE(NULLIF(s.email, ''), u.email) AS email,
                    COALESCE(NULLIF(s.roll_number, ''), 'Not Assigned') AS roll_number,
                    COALESCE(s.department, 'Not Assigned') AS department
                FROM students s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.id = %s AND s.institution_id = %s
                """,
                (student_id, scoped_institution_id),
            )

            row = cur.fetchone()

    if not row:
        return None

    return {
        "id": row[0],
        "user_id": row[1],
        "name": row[2],
        "email": row[3],
        "roll_number": row[4],
        "department": row[5],
    }
