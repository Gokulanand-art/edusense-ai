from typing import Any

from database import get_db_connection


READINESS_WEIGHTS = {
    "attendance": 0.30,
    "marks": 0.40,
    "skills": 0.20,
    "mock_tests": 0.10,
}


STUDENT_SCORE_CTE = """
WITH attendance_stats AS (
    SELECT
        student_id,
        COUNT(*) FILTER (WHERE status = 'Present') * 100.0 / NULLIF(COUNT(*), 0) AS attendance_score
    FROM attendance
    GROUP BY student_id
),
marks_stats AS (
    SELECT
        student_id,
        AVG(marks) AS marks_score
    FROM marks
    GROUP BY student_id
),
skills_stats AS (
    SELECT
        student_id,
        COUNT(*) AS skills_count,
        LEAST(COUNT(*) * 10, 100) AS skills_score
    FROM student_skills
    GROUP BY student_id
),
mock_stats AS (
    SELECT
        student_id,
        AVG(score) AS mock_score
    FROM mock_tests
    GROUP BY student_id
),
student_scores AS (
    SELECT
        s.id AS student_id,
        s.institution_id AS institution_id,
        COALESCE(NULLIF(s.name, ''), u.name) AS name,
        COALESCE(NULLIF(s.email, ''), u.email) AS email,
        COALESCE(NULLIF(s.roll_number, ''), 'Not Assigned') AS roll_number,
        COALESCE(NULLIF(s.department, ''), 'Not Assigned') AS department,
        COALESCE(a.attendance_score, 0) AS attendance,
        COALESCE(m.marks_score, 0) AS marks,
        COALESCE(sk.skills_count, 0) AS skills_count,
        COALESCE(sk.skills_score, 0) AS skills_score,
        COALESCE(mt.mock_score, 0) AS mock_score,
        ROUND(
            (COALESCE(a.attendance_score, 0) * 0.3) +
            (COALESCE(m.marks_score, 0) * 0.4) +
            (COALESCE(sk.skills_score, 0) * 0.2) +
            (COALESCE(mt.mock_score, 0) * 0.1),
            2
        ) AS final_score
    FROM students s
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN attendance_stats a ON a.student_id = s.id
    LEFT JOIN marks_stats m ON m.student_id = s.id
    LEFT JOIN skills_stats sk ON sk.student_id = s.id
    LEFT JOIN mock_stats mt ON mt.student_id = s.id
)
"""


def _status_from_score(score: float) -> str:
    if score >= 80:
        return "Placement Ready"
    if score >= 60:
        return "Moderate"
    return "Needs Improvement"


def _risk_from_metrics(attendance: float, marks: float) -> str:
    if attendance < 60 or marks < 50:
        return "At Risk"
    if attendance < 75 or marks < 60:
        return "Warning"
    return "Safe"


def _clamp_score_value(value: Any) -> float:
    """Normalize one score component into the supported 0-100 range."""
    try:
        numeric_value = float(value or 0)
    except (TypeError, ValueError):
        numeric_value = 0
    return min(max(numeric_value, 0), 100)


def calculate_weighted_score(
    attendance: Any = 0,
    marks: Any = 0,
    skills_score: Any = 0,
    mock_score: Any = 0,
    weights: dict[str, float] | None = None,
) -> float:
    """Calculate the weighted readiness score from normalized inputs."""
    active_weights = weights or READINESS_WEIGHTS
    if round(sum(active_weights.values()), 10) != 1.0:
        raise ValueError("Readiness weights must sum to 1.0")

    weighted_score = (
        _clamp_score_value(attendance) * active_weights["attendance"]
        + _clamp_score_value(marks) * active_weights["marks"]
        + _clamp_score_value(skills_score) * active_weights["skills"]
        + _clamp_score_value(mock_score) * active_weights["mock_tests"]
    )
    return round(weighted_score, 2)


def _row_to_score_payload(row: tuple[Any, ...]) -> dict[str, Any]:
    attendance = round(_clamp_score_value(row[5]), 2)
    marks = round(_clamp_score_value(row[6]), 2)
    skills_count = max(int(row[7] or 0), 0)
    skills_score = round(_clamp_score_value(row[8]), 2)
    mock_score = round(_clamp_score_value(row[9]), 2)
    final_score = calculate_weighted_score(attendance, marks, skills_score, mock_score)

    return {
        "student_id": row[0],
        "name": row[1],
        "email": row[2],
        "roll_number": row[3],
        "department": row[4],
        "attendance": attendance,
        "marks": marks,
        "skills_count": skills_count,
        "skills_score": skills_score,
        "mock_score": mock_score,
        "final_score": final_score,
        "status": _status_from_score(final_score),
        "risk_status": _risk_from_metrics(attendance, marks),
    }


def _fetch_student_score_rows(search=None, department=None, sort_order="desc", connection=None, institution_id=None):
    conditions = []
    params = []

    if institution_id is not None:
        conditions.append("institution_id = %s")
        params.append(institution_id)

    if search:
        conditions.append("(name ILIKE %s OR email ILIKE %s OR roll_number ILIKE %s)")
        params.extend([f"%{search.strip()}%", f"%{search.strip()}%", f"%{search.strip()}%"])

    if department and department.strip().lower() != "all":
        conditions.append("department = %s")
        params.append(department.strip())

    where_clause = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    order_direction = "DESC" if (sort_order or "desc").lower() != "asc" else "ASC"
    query = (
        STUDENT_SCORE_CTE
        + f"""
        SELECT
            student_id,
            name,
            email,
            roll_number,
            department,
            attendance,
            marks,
            skills_count,
            skills_score,
            mock_score,
            final_score
        FROM student_scores
        {where_clause}
        ORDER BY final_score {order_direction}, name ASC, student_id ASC
        """
    )

    if connection is not None:
        with connection.cursor() as cur:
            cur.execute(query, tuple(params))
            return cur.fetchall()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, tuple(params))
            return cur.fetchall()


def calculate_readiness(student_id, institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                STUDENT_SCORE_CTE
                + """
                SELECT
                    student_id,
                    name,
                    email,
                    roll_number,
                    department,
                    attendance,
                    marks,
                    skills_count,
                    skills_score,
                    mock_score,
                    final_score
                FROM student_scores
                WHERE student_id = %s
                  AND (%s IS NULL OR institution_id = %s)
                """,
                (student_id, institution_id, institution_id),
            )
            row = cur.fetchone()

    if not row:
        return {
            "attendance": 0,
            "marks": 0,
            "skills_count": 0,
            "skills_score": 0,
            "mock_score": 0,
            "final_score": 0,
            "status": "Needs Improvement",
            "risk_status": "At Risk",
        }

    payload = _row_to_score_payload(row)

    return {
        "attendance": payload["attendance"],
        "marks": payload["marks"],
        "skills_count": payload["skills_count"],
        "skills_score": payload["skills_score"],
        "mock_score": payload["mock_score"],
        "final_score": payload["final_score"],
        "status": payload["status"],
        "risk_status": payload["risk_status"],
    }


def get_all_scored_students(search=None, department=None, status=None, sort_order="desc", institution_id=None):
    rows = _fetch_student_score_rows(
        search=search,
        department=department,
        sort_order=sort_order,
        institution_id=institution_id,
    )
    results = []

    for row in rows:
        payload = _row_to_score_payload(row)

        if status and payload["status"].lower() != status.lower():
            continue

        results.append(payload)

    return results


def get_top_students(limit=5, institution_id=None):
    return get_all_scored_students(sort_order="desc", institution_id=institution_id)[:limit]


def get_top_students_by_department(limit_per_department=3, institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                STUDENT_SCORE_CTE
                + """
                SELECT
                    department,
                    student_id,
                    name,
                    email,
                    roll_number,
                    attendance,
                    marks,
                    skills_count,
                    skills_score,
                    mock_score,
                    final_score
                FROM (
                    SELECT
                        student_scores.*,
                        ROW_NUMBER() OVER (
                            PARTITION BY department
                            ORDER BY final_score DESC, name ASC, student_id ASC
                        ) AS department_rank
                    FROM student_scores
                    WHERE (%s IS NULL OR institution_id = %s)
                ) ranked_scores
                WHERE department_rank <= %s
                ORDER BY department ASC, final_score DESC, name ASC, student_id ASC
                """,
                (institution_id, institution_id, limit_per_department),
            )
            rows = cur.fetchall()

    grouped = []
    current_department = None

    for row in rows:
        department_name = row[0]
        payload = _row_to_score_payload(
            (row[1], row[2], row[3], row[4], row[0], row[5], row[6], row[7], row[8], row[9], row[10])
        )

        if department_name != current_department:
            grouped.append({
                "department": department_name,
                "students": [],
            })
            current_department = department_name

        grouped[-1]["students"].append({
            "student_id": payload["student_id"],
            "name": payload["name"],
            "email": payload["email"],
            "roll_number": payload["roll_number"],
            "department": payload["department"],
            "score": payload["final_score"],
            "status": payload["status"],
        })

    return grouped


def get_low_performing_students(threshold=60, institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                STUDENT_SCORE_CTE
                + """
                SELECT
                    student_id,
                    name,
                    email,
                    roll_number,
                    department,
                    attendance,
                    marks,
                    skills_count,
                    skills_score,
                    mock_score,
                    final_score
                FROM student_scores
                WHERE final_score < %s
                  AND (%s IS NULL OR institution_id = %s)
                ORDER BY final_score ASC, name ASC, student_id ASC
                """,
                (threshold, institution_id, institution_id),
            )
            rows = cur.fetchall()

    return [
        {
            "student_id": payload["student_id"],
            "name": payload["name"],
            "email": payload["email"],
            "roll_number": payload["roll_number"],
            "department": payload["department"],
            "attendance": payload["attendance"],
            "marks": payload["marks"],
            "skills_count": payload["skills_count"],
            "skills_score": payload["skills_score"],
            "mock_score": payload["mock_score"],
            "final_score": payload["final_score"],
            "score": payload["final_score"],
            "status": payload["status"],
        }
        for payload in (_row_to_score_payload(row) for row in rows)
    ]


def get_department_average_scores(institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                STUDENT_SCORE_CTE
                + """
                SELECT
                    department,
                    ROUND(AVG(final_score), 2) AS average_score,
                    COUNT(*) AS student_count
                FROM student_scores
                WHERE (%s IS NULL OR institution_id = %s)
                GROUP BY department
                ORDER BY average_score DESC, department ASC
                """,
                (institution_id, institution_id),
            )
            rows = cur.fetchall()

    return [
        {
            "department": row[0],
            "average_score": float(row[1] or 0),
            "student_count": row[2],
        }
        for row in rows
    ]
