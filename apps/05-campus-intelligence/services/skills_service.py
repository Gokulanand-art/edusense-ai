from contextlib import nullcontext

from database import get_db_connection
from services.student_service import ensure_student_table_consistency

VALID_SKILL_LEVELS = {"Beginner", "Intermediate", "Advanced"}
_SKILLS_SCHEMA_READY = False


def _connection_scope(connection=None):
    return nullcontext(connection) if connection is not None else get_db_connection()


def ensure_skills_table_consistency(connection=None):
    global _SKILLS_SCHEMA_READY

    if _SKILLS_SCHEMA_READY:
        return

    with _connection_scope(connection) as conn:
        ensure_student_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS skills (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE
                )
                """
            )

            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS student_skills (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER,
                    skill_id INTEGER,
                    skill_level VARCHAR(20) DEFAULT 'Intermediate',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE skills ADD COLUMN IF NOT EXISTS name VARCHAR(100)")
            cur.execute("ALTER TABLE student_skills ADD COLUMN IF NOT EXISTS student_id INTEGER")
            cur.execute("ALTER TABLE student_skills ADD COLUMN IF NOT EXISTS skill_id INTEGER")
            cur.execute("ALTER TABLE student_skills ADD COLUMN IF NOT EXISTS skill_level VARCHAR(20) DEFAULT 'Intermediate'")
            cur.execute("ALTER TABLE student_skills ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("UPDATE student_skills SET skill_level = 'Intermediate' WHERE skill_level IS NULL")
            cur.execute("ALTER TABLE student_skills DROP CONSTRAINT IF EXISTS student_skills_student_id_fkey")
            cur.execute("ALTER TABLE student_skills DROP CONSTRAINT IF EXISTS student_skills_skill_id_fkey")
            cur.execute("ALTER TABLE student_skills DROP CONSTRAINT IF EXISTS student_skills_unique_student_skill")
            cur.execute(
                """
                ALTER TABLE student_skills
                ADD CONSTRAINT student_skills_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id)
                ON DELETE CASCADE
                """
            )
            cur.execute(
                """
                ALTER TABLE student_skills
                ADD CONSTRAINT student_skills_skill_id_fkey
                FOREIGN KEY (skill_id) REFERENCES skills(id)
                ON DELETE CASCADE
                """
            )
            cur.execute(
                """
                ALTER TABLE student_skills
                ADD CONSTRAINT student_skills_unique_student_skill
                UNIQUE (student_id, skill_id)
                """
            )

    _SKILLS_SCHEMA_READY = True


def normalize_skill_level(skill_level):
    value = (skill_level or "Intermediate").strip().title()

    if value not in VALID_SKILL_LEVELS:
        raise ValueError("skill_level must be Beginner, Intermediate, or Advanced")

    return value


def add_skill(name):
    with get_db_connection() as conn:
        ensure_skills_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO skills (name)
                VALUES (%s)
                ON CONFLICT (name) DO NOTHING
                RETURNING id
                """,
                (name,),
            )
            row = cur.fetchone()

            if row is None:
                cur.execute(
                    """
                    SELECT id
                    FROM skills
                    WHERE LOWER(name) = LOWER(%s)
                    """,
                    (name,),
                )
                row = cur.fetchone()

    return row[0] if row else None


def get_or_create_skill(name, connection=None):
    with _connection_scope(connection) as conn:
        ensure_skills_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM skills
                WHERE LOWER(name) = LOWER(%s)
                """,
                (name,),
            )
            row = cur.fetchone()

            if row:
                skill_id = row[0]
            else:
                cur.execute(
                    """
                    INSERT INTO skills (name)
                    VALUES (%s)
                    RETURNING id
                    """,
                    (name,),
                )
                skill_id = cur.fetchone()[0]

    return skill_id


def assign_skill(student_id, skill_id, skill_level="Intermediate"):
    with get_db_connection() as conn:
        ensure_skills_table_consistency(conn)
        normalized_level = normalize_skill_level(skill_level)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM student_skills
                WHERE student_id = %s AND skill_id = %s
                """,
                (student_id, skill_id),
            )
            existing = cur.fetchone()

            if existing:
                cur.execute(
                    """
                    UPDATE student_skills
                    SET skill_level = %s
                    WHERE id = %s
                    """,
                    (normalized_level, existing[0]),
                )
                action = "updated"
            else:
                cur.execute(
                    """
                    INSERT INTO student_skills (student_id, skill_id, skill_level)
                    VALUES (%s, %s, %s)
                    """,
                    (student_id, skill_id, normalized_level),
                )
                action = "created"

    return action


def get_student_skills(student_id):
    with get_db_connection() as conn:
        ensure_skills_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT sk.id, sk.name, ss.skill_level
                FROM student_skills ss
                JOIN skills sk ON ss.skill_id = sk.id
                WHERE ss.student_id = %s
                ORDER BY sk.name ASC
                """,
                (student_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "skill_id": row[0],
            "skill_name": row[1],
            "skill_level": row[2] or "Intermediate",
        }
        for row in rows
    ]
