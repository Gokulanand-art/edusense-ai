from datetime import date, timedelta
from math import gcd

from database import get_db_connection
from services.student_service import ensure_student_table_consistency
from services.subject_service import ensure_subject_table_consistency

_ATTENDANCE_SCHEMA_READY = False


def ensure_attendance_table_consistency(connection=None):
    global _ATTENDANCE_SCHEMA_READY

    if _ATTENDANCE_SCHEMA_READY:
        return

    def apply_schema(conn):
        ensure_student_table_consistency(conn)
        ensure_subject_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS attendance (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER,
                    subject_id INTEGER,
                    date DATE NOT NULL DEFAULT CURRENT_DATE,
                    status VARCHAR(20),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS student_id INTEGER")
            cur.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS subject_id INTEGER")
            cur.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS date DATE NOT NULL DEFAULT CURRENT_DATE")
            cur.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS status VARCHAR(20)")
            cur.execute("ALTER TABLE attendance ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_fkey")
            cur.execute("ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_subject_id_fkey")
            cur.execute(
                """
                ALTER TABLE attendance
                ADD CONSTRAINT attendance_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id)
                ON DELETE CASCADE
                """
            )
            cur.execute(
                """
                ALTER TABLE attendance
                ADD CONSTRAINT attendance_subject_id_fkey
                FOREIGN KEY (subject_id) REFERENCES subjects(id)
                ON DELETE CASCADE
                """
            )

    if connection is not None:
        apply_schema(connection)
    else:
        with get_db_connection() as conn:
            apply_schema(conn)

    _ATTENDANCE_SCHEMA_READY = True


def mark_attendance(student_id, subject_id, status):
    with get_db_connection() as conn:
        ensure_attendance_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO attendance (student_id, subject_id, status)
                VALUES (%s, %s, %s)
                """,
                (student_id, subject_id, status),
            )


def save_attendance_percentage(student_id, subject_id, attendance_percentage):
    percentage = int(round(float(attendance_percentage)))

    if percentage < 0 or percentage > 100:
        raise ValueError("Attendance percentage must be between 0 and 100")

    if percentage == 0:
        present_count = 0
        total_count = 1
    elif percentage == 100:
        present_count = 1
        total_count = 1
    else:
        common_divisor = gcd(percentage, 100)
        present_count = percentage // common_divisor
        total_count = 100 // common_divisor

    absent_count = total_count - present_count
    today = date.today()

    with get_db_connection() as conn:
        ensure_attendance_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM attendance
                WHERE student_id = %s AND subject_id = %s
                """,
                (student_id, subject_id),
            )

            for index in range(present_count):
                cur.execute(
                    """
                    INSERT INTO attendance (student_id, subject_id, date, status)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (student_id, subject_id, today - timedelta(days=index), "Present"),
                )

            for index in range(absent_count):
                cur.execute(
                    """
                    INSERT INTO attendance (student_id, subject_id, date, status)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (
                        student_id,
                        subject_id,
                        today - timedelta(days=present_count + index),
                        "Absent",
                    ),
                )


def get_attendance(student_id):
    with get_db_connection() as conn:
        ensure_attendance_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.id, s.name, sub.name, a.date, a.status
                FROM attendance a
                JOIN students s ON a.student_id = s.id
                JOIN subjects sub ON a.subject_id = sub.id
                WHERE a.student_id = %s
                ORDER BY a.date DESC
                """,
                (student_id,),
            )

            rows = cur.fetchall()

    attendance_list = []
    for row in rows:
        attendance_list.append({
            "id": row[0],
            "student": row[1],
            "subject": row[2],
            "date": str(row[3]),
            "status": row[4],
        })

    return attendance_list
