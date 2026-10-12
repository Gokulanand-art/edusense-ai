from database import get_db_connection
from services.student_service import ensure_student_table_consistency

_MOCK_SCHEMA_READY = False


def ensure_mock_tests_table_consistency(connection=None):
    global _MOCK_SCHEMA_READY

    if _MOCK_SCHEMA_READY:
        return

    def apply_schema(conn):
        ensure_student_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS mock_tests (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER,
                    score INTEGER,
                    test_name VARCHAR(150),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS student_id INTEGER")
            cur.execute("ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS score INTEGER")
            cur.execute("ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS test_name VARCHAR(150)")
            cur.execute("ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE mock_tests DROP CONSTRAINT IF EXISTS mock_tests_student_id_fkey")
            cur.execute(
                """
                ALTER TABLE mock_tests
                ADD CONSTRAINT mock_tests_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id)
                ON DELETE CASCADE
                """
            )

    if connection is not None:
        apply_schema(connection)
    else:
        with get_db_connection() as conn:
            apply_schema(conn)

    _MOCK_SCHEMA_READY = True


def add_mock_test(student_id, score, test_name):
    with get_db_connection() as conn:
        ensure_mock_tests_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO mock_tests (student_id, score, test_name)
                VALUES (%s, %s, %s)
            """, (student_id, score, test_name))


def save_mock_test(student_id, score, test_name):
    with get_db_connection() as conn:
        ensure_mock_tests_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM mock_tests
                WHERE student_id = %s AND test_name = %s
                ORDER BY created_at DESC NULLS LAST, id DESC
                LIMIT 1
                """,
                (student_id, test_name),
            )
            existing = cur.fetchone()

            if existing:
                cur.execute(
                    """
                    UPDATE mock_tests
                    SET score = %s,
                        test_name = %s
                    WHERE id = %s
                    """,
                    (score, test_name, existing[0]),
                )
                action = "updated"
            else:
                cur.execute(
                    """
                    INSERT INTO mock_tests (student_id, score, test_name)
                    VALUES (%s, %s, %s)
                    """,
                    (student_id, score, test_name),
                )
                action = "created"

    return action


def get_mock_scores(student_id):
    with get_db_connection() as conn:
        ensure_mock_tests_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute("""
                SELECT score, test_name, created_at
                FROM mock_tests
                WHERE student_id = %s
                ORDER BY created_at DESC
            """, (student_id,))

            rows = cur.fetchall()

    results = []
    for row in rows:
        results.append({
            "score": row[0],
            "test_name": row[1],
            "date": str(row[2])
        })

    return results


def get_average_mock_score(student_id):
    with get_db_connection() as conn:
        ensure_mock_tests_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute("""
                SELECT AVG(score)
                FROM mock_tests
                WHERE student_id = %s
            """, (student_id,))

            result = cur.fetchone()[0] or 0

    return float(result)


# 🔥 NEW: TREND FUNCTION
def get_mock_trend(student_id):
    with get_db_connection() as conn:
        ensure_mock_tests_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute("""
                SELECT score
                FROM mock_tests
                WHERE student_id = %s
                ORDER BY created_at DESC
                LIMIT 3
            """, (student_id,))

            scores = [float(row[0]) for row in cur.fetchall()]

    if len(scores) < 2:
        return "Not enough data"

    # latest → older
    if len(scores) == 3:
        if scores[0] > scores[1] > scores[2]:
            return "Improving"
        elif scores[0] < scores[1] < scores[2]:
            return "Declining"

    return "Stable"
