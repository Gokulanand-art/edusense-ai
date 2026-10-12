from contextlib import nullcontext
from datetime import date, datetime, timedelta

from database import get_db_connection
from services.attendance_service import (
    ensure_attendance_table_consistency,
    get_attendance,
    save_attendance_percentage,
)
from services.marks_service import (
    ensure_marks_table_consistency,
    get_marks_by_student,
    get_subject_wise_marks,
    save_marks,
)
from services.mock_service import get_mock_scores, get_mock_trend
from services.realtime_notification_service import RealtimeNotificationService
from services.readiness_service import get_all_scored_students
from services.student_dashboard_service import get_student_dashboard_data
from services.student_service import (
    ensure_student_table_consistency,
    get_all_departments,
    get_student_profile,
)
from services.subject_service import get_subject_by_id

_INTERVENTION_SCHEMA_READY = False


def _connection_scope(connection=None):
    return nullcontext(connection) if connection is not None else get_db_connection()


def ensure_intervention_table_consistency(connection=None):
    global _INTERVENTION_SCHEMA_READY

    if _INTERVENTION_SCHEMA_READY:
        return

    with _connection_scope(connection) as conn:
        ensure_student_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS student_interventions (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    faculty_user_id INTEGER,
                    intervention_type VARCHAR(50) NOT NULL DEFAULT 'academic',
                    priority VARCHAR(20) NOT NULL DEFAULT 'medium',
                    status VARCHAR(20) NOT NULL DEFAULT 'open',
                    summary TEXT NOT NULL,
                    action_plan TEXT,
                    due_date DATE,
                    notified_student BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    resolved_at TIMESTAMP
                )
                """
            )

            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS faculty_user_id INTEGER")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS intervention_type VARCHAR(50) NOT NULL DEFAULT 'academic'")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium'")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open'")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS summary TEXT")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS action_plan TEXT")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS due_date DATE")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS notified_student BOOLEAN NOT NULL DEFAULT FALSE")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE student_interventions ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMP")

            cur.execute("CREATE INDEX IF NOT EXISTS idx_student_interventions_student_id ON student_interventions(student_id)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_student_interventions_status ON student_interventions(status)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_student_interventions_due_date ON student_interventions(due_date)")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_student_interventions_created_at ON student_interventions(created_at DESC)")

    _INTERVENTION_SCHEMA_READY = True


def _normalize_intervention_type(value):
    normalized = str(value or "academic").strip().lower()
    if normalized not in {"academic", "attendance", "mock", "skills", "wellbeing", "placement"}:
        raise ValueError("intervention_type must be academic, attendance, mock, skills, wellbeing, or placement")
    return normalized


def _normalize_intervention_priority(value):
    normalized = str(value or "medium").strip().lower()
    if normalized not in {"low", "medium", "high", "urgent"}:
        raise ValueError("priority must be low, medium, high, or urgent")
    return normalized


def _normalize_intervention_status(value):
    normalized = str(value or "open").strip().lower()
    if normalized not in {"open", "in_progress", "closed"}:
        raise ValueError("status must be open, in_progress, or closed")
    return normalized


def _serialize_intervention_row(row):
    return {
        "id": row[0],
        "student_id": row[1],
        "faculty_user_id": row[2],
        "faculty_name": row[3] or "Faculty",
        "intervention_type": row[4],
        "priority": row[5],
        "status": row[6],
        "summary": row[7],
        "action_plan": row[8],
        "due_date": row[9].isoformat() if row[9] else None,
        "notified_student": bool(row[10]),
        "created_at": row[11].isoformat() if row[11] else None,
        "updated_at": row[12].isoformat() if row[12] else None,
        "resolved_at": row[13].isoformat() if row[13] else None,
    }


def _get_intervention_maps(student_ids):
    if not student_ids:
        return {}, {}

    with get_db_connection() as conn:
        ensure_intervention_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT ON (si.student_id)
                    si.id,
                    si.student_id,
                    si.faculty_user_id,
                    COALESCE(u.name, u.email, 'Faculty') AS faculty_name,
                    si.intervention_type,
                    si.priority,
                    si.status,
                    si.summary,
                    si.action_plan,
                    si.due_date,
                    si.notified_student,
                    si.created_at,
                    si.updated_at,
                    si.resolved_at
                FROM student_interventions si
                LEFT JOIN users u ON si.faculty_user_id = u.id
                WHERE si.student_id = ANY(%s)
                ORDER BY si.student_id, si.created_at DESC, si.id DESC
                """,
                (student_ids,),
            )
            latest_map = {
                row[1]: _serialize_intervention_row(row)
                for row in cur.fetchall()
            }

            cur.execute(
                """
                SELECT
                    student_id,
                    COUNT(*) AS total_cases,
                    COUNT(*) FILTER (WHERE status <> 'closed') AS open_case_count
                FROM student_interventions
                WHERE student_id = ANY(%s)
                GROUP BY student_id
                """,
                (student_ids,),
            )
            count_map = {
                row[0]: {
                    "total_cases": int(row[1] or 0),
                    "open_case_count": int(row[2] or 0),
                }
                for row in cur.fetchall()
            }
    return latest_map, count_map


def _get_intervention_focus(student):
    focuses = []

    if float(student.get("attendance") or 0) < 75:
        focuses.append("attendance recovery")
    if float(student.get("marks") or 0) < 60:
        focuses.append("marks recovery")
    if float(student.get("mock_score") or 0) < 60:
        focuses.append("mock practice")
    if int(student.get("skills_count") or 0) < 3:
        focuses.append("skill-building")

    if not focuses:
        return "general academic follow-up"

    return ", ".join(focuses[:2])


def _hydrate_student_intervention_fields(students):
    latest_map, count_map = _get_intervention_maps([student["student_id"] for student in students])

    for student in students:
        latest = latest_map.get(student["student_id"])
        counts = count_map.get(student["student_id"], {})
        student["open_case_count"] = counts.get("open_case_count", 0)
        student["total_case_count"] = counts.get("total_cases", 0)
        student["latest_intervention"] = latest
        student["intervention_status"] = latest["status"] if latest else "no_case"
        student["intervention_priority"] = latest["priority"] if latest else None
        student["intervention_due_date"] = latest["due_date"] if latest else None
        student["recommended_focus"] = _get_intervention_focus(student)


def get_student_interventions(student_id, limit=10, institution_id=None):
    with get_db_connection() as conn:
        ensure_intervention_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    si.id,
                    si.student_id,
                    si.faculty_user_id,
                    COALESCE(u.name, u.email, 'Faculty') AS faculty_name,
                    si.intervention_type,
                    si.priority,
                    si.status,
                    si.summary,
                    si.action_plan,
                    si.due_date,
                    si.notified_student,
                    si.created_at,
                    si.updated_at,
                    si.resolved_at
                FROM student_interventions si
                LEFT JOIN users u ON si.faculty_user_id = u.id
                JOIN students s ON s.id = si.student_id
                WHERE si.student_id = %s
                  AND (%s IS NULL OR s.institution_id = %s)
                ORDER BY si.created_at DESC, si.id DESC
                LIMIT %s
                """,
                (student_id, institution_id, institution_id, limit),
            )
            rows = cur.fetchall()

    return [_serialize_intervention_row(row) for row in rows]


def create_student_intervention(student_id, faculty_user_id, payload, institution_id=None):
    profile = get_student_profile(student_id, institution_id=institution_id)
    if not profile:
        raise ValueError("Student not found")

    summary = " ".join(str(payload.get("summary") or "").strip().split())
    if not summary:
        raise ValueError("Intervention summary is required")

    action_plan = " ".join(str(payload.get("action_plan") or "").strip().split())
    intervention_type = _normalize_intervention_type(payload.get("intervention_type"))
    priority = _normalize_intervention_priority(payload.get("priority"))
    status = _normalize_intervention_status(payload.get("status") or "open")
    notify_student = bool(payload.get("notify_student", True))

    due_date_value = payload.get("due_date")
    parsed_due_date = None
    if due_date_value:
        try:
            parsed_due_date = date.fromisoformat(str(due_date_value))
        except ValueError as exc:
            raise ValueError("due_date must use YYYY-MM-DD format") from exc

    with get_db_connection() as conn:
        ensure_intervention_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO student_interventions (
                    student_id,
                    faculty_user_id,
                    intervention_type,
                    priority,
                    status,
                    summary,
                    action_plan,
                    due_date,
                    notified_student,
                    resolved_at,
                    created_at,
                    updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                RETURNING id
                """,
                (
                    int(student_id),
                    int(faculty_user_id),
                    intervention_type,
                    priority,
                    status,
                    summary,
                    action_plan or None,
                    parsed_due_date,
                    notify_student and bool(profile.get("user_id")),
                    datetime.now() if status == "closed" else None,
                ),
            )
            intervention_id = cur.fetchone()[0]

    if notify_student and profile.get("user_id"):
        due_copy = f" Follow-up due on {parsed_due_date.isoformat()}." if parsed_due_date else ""
        RealtimeNotificationService.ensure_notifications_table()
        RealtimeNotificationService.create_notification(
            int(profile["user_id"]),
            "Faculty support plan added",
            f"A faculty support action was added for you: {summary}.{due_copy}",
            notification_type=RealtimeNotificationService.TYPE_ALERT,
            priority=priority if priority in {"low", "medium", "high", "urgent"} else RealtimeNotificationService.PRIORITY_MEDIUM,
            action_url="/notifications",
            metadata={
                "student_id": int(student_id),
                "intervention_id": intervention_id,
                "intervention_type": intervention_type,
            },
        )

    created = get_student_interventions(student_id, limit=10, institution_id=institution_id)
    return next((item for item in created if item["id"] == intervention_id), None)


def update_student_intervention_status(intervention_id, status, faculty_user_id=None, institution_id=None):
    normalized_status = _normalize_intervention_status(status)

    with get_db_connection() as conn:
        ensure_intervention_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT student_id
                FROM student_interventions si
                JOIN students s ON s.id = si.student_id
                WHERE si.id = %s
                  AND (%s IS NULL OR s.institution_id = %s)
                """,
                (intervention_id, institution_id, institution_id),
            )
            row = cur.fetchone()

            if not row:
                raise ValueError("Intervention not found")

            cur.execute(
                """
                UPDATE student_interventions
                SET
                    status = %s,
                    faculty_user_id = COALESCE(%s, faculty_user_id),
                    updated_at = CURRENT_TIMESTAMP,
                    resolved_at = CASE
                        WHEN %s = 'closed' THEN CURRENT_TIMESTAMP
                        ELSE NULL
                    END
                WHERE id = %s
                """,
                (normalized_status, faculty_user_id, normalized_status, intervention_id),
            )

    updated = get_student_interventions(row[0], limit=10, institution_id=institution_id)
    return next((item for item in updated if item["id"] == intervention_id), None)


def get_intervention_watchlist(search=None, department=None, limit=8, students=None, institution_id=None):
    students = students or get_all_students_dashboard(
        filter_status=None,
        sort_order="asc",
        search=search,
        department=department,
        institution_id=institution_id,
    )

    focus_students = [
        student for student in students
        if float(student.get("final_score") or 0) < 70
        or float(student.get("attendance") or 0) < 75
        or float(student.get("marks") or 0) < 60
        or float(student.get("mock_score") or 0) < 60
    ]

    def _watchlist_sort_key(student):
        latest = student.get("latest_intervention") or {}
        due_date_value = latest.get("due_date") or "9999-12-31"
        no_case = 0 if student.get("open_case_count", 0) == 0 else 1
        return (
            no_case,
            float(student.get("final_score") or 0),
            due_date_value,
            student.get("name") or "",
        )

    focus_students.sort(key=_watchlist_sort_key)

    results = []
    for student in focus_students[:limit]:
        latest = student.get("latest_intervention") or {}
        results.append({
            "student_id": student["student_id"],
            "name": student["name"],
            "roll_number": student.get("roll_number"),
            "department": student["department"],
            "readiness_score": student["final_score"],
            "risk_status": student["risk_status"],
            "recommended_focus": student["recommended_focus"],
            "open_case_count": student.get("open_case_count", 0),
            "latest_status": latest.get("status") or "no_case",
            "latest_priority": latest.get("priority"),
            "due_date": latest.get("due_date"),
            "latest_summary": latest.get("summary"),
        })

    return results


def get_intervention_summary(search=None, department=None, students=None, institution_id=None):
    students = students or get_all_students_dashboard(
        filter_status=None,
        sort_order="asc",
        search=search,
        department=department,
        institution_id=institution_id,
    )
    focus_students = [
        student for student in students
        if float(student.get("final_score") or 0) < 70
        or float(student.get("attendance") or 0) < 75
        or float(student.get("marks") or 0) < 60
        or float(student.get("mock_score") or 0) < 60
    ]

    open_cases = 0
    overdue_cases = 0
    due_this_week = 0
    students_without_case = 0
    today = date.today()
    week_end = today + timedelta(days=7)

    for student in focus_students:
        latest = student.get("latest_intervention") or {}
        if int(student.get("open_case_count") or 0) == 0:
            students_without_case += 1
        else:
            open_cases += int(student.get("open_case_count") or 0)

        due_date_value = latest.get("due_date")
        if latest.get("status") and latest.get("status") != "closed" and due_date_value:
            try:
                parsed_due = date.fromisoformat(due_date_value)
            except ValueError:
                parsed_due = None

            if parsed_due and parsed_due < today:
                overdue_cases += 1
            elif parsed_due and today <= parsed_due <= week_end:
                due_this_week += 1

    return {
        "focus_students": len(focus_students),
        "open_cases": open_cases,
        "overdue_cases": overdue_cases,
        "due_this_week": due_this_week,
        "students_without_case": students_without_case,
    }


def calculate_student_dashboard(student_id, institution_id=None):
    dashboard = get_student_dashboard_data(student_id, institution_id=institution_id)

    return {
        "attendance": dashboard["attendance"],
        "marks": dashboard["marks"],
        "mock_score": dashboard["mock_score"],
        "skills_count": dashboard["skills_count"],
        "final_score": dashboard["readiness_score"],
        "status": dashboard["status"],
        "trend": dashboard["trend"],
        "risk_status": dashboard["risk_level"],
    }


def get_all_students_dashboard(filter_status=None, sort_order=None, search=None, department=None, institution_id=None):
    students = get_all_scored_students(
        search=search,
        department=department,
        status=filter_status,
        sort_order=sort_order or "desc",
        institution_id=institution_id,
    )

    results = []
    for student in students:
        results.append({
            "id": student["student_id"],
            "student_id": student["student_id"],
            "name": student["name"],
            "email": student["email"],
            "roll_number": student.get("roll_number"),
            "department": student["department"],
            "attendance": student["attendance"],
            "marks": student["marks"],
            "mock_score": student["mock_score"],
            "skills_count": student["skills_count"],
            "final_score": student["final_score"],
            "status": student["status"],
            "risk_status": student["risk_status"],
            "trend": get_mock_trend(student["student_id"]),
        })

    _hydrate_student_intervention_fields(results)
    return results


def get_faculty_dashboard_summary(search=None, department=None, filter_status=None, sort_order=None, institution_id=None):
    """
    Get faculty dashboard summary with enhanced insights.
    Includes: total students, average marks, at-risk count, students needing attention.
    """
    students = get_all_students_dashboard(
        filter_status=filter_status,
        sort_order=sort_order,
        search=search,
        department=department,
        institution_id=institution_id,
    )

    total_students = len(students)
    average_marks = round(
        sum(float(student["marks"] or 0) for student in students) / total_students,
        2,
    ) if total_students else 0

    at_risk_students = [
        student for student in students
        if float(student["final_score"] or 0) < 60 or student["risk_status"] == "At Risk"
    ]
    
    # Students needing attention: those with warning status or specific metric issues
    students_needing_attention = [
        student for student in students
        if (float(student["attendance"] or 0) < 75 or 
            float(student["marks"] or 0) < 60 or
            float(student["mock_score"] or 0) < 60)
    ]

    return {
        "summary": {
            "total_students": total_students,
            "average_marks": average_marks,
            "at_risk_count": len(at_risk_students),
            "students_needing_attention_count": len(students_needing_attention),
            "departments": get_all_departments(institution_id=institution_id),
        },
        "intervention_summary": get_intervention_summary(
            search=search,
            department=department,
            students=students,
            institution_id=institution_id,
        ),
        "intervention_watchlist": get_intervention_watchlist(
            search=search,
            department=department,
            students=students,
            institution_id=institution_id,
        ),
        "at_risk_students": at_risk_students[:10],
        "students_needing_attention": students_needing_attention[:10],
    }


def get_student_detail(student_id, institution_id=None):
    dashboard = get_student_dashboard_data(student_id, institution_id=institution_id)

    return {
        "profile": get_student_profile(student_id, institution_id=institution_id),
        "overview": {
            "attendance": dashboard["attendance"],
            "marks": dashboard["marks"],
            "mock_score": dashboard["mock_score"],
            "readiness_score": dashboard["readiness_score"],
            "status": dashboard["status"],
            "risk_level": dashboard["risk_level"],
        },
        "subject_performance": get_subject_wise_marks(student_id, institution_id=institution_id),
        "marks_history": get_marks_by_student(student_id, institution_id=institution_id),
        "attendance_history": get_attendance(student_id),
        "mock_scores": get_mock_scores(student_id),
        "placement_reasons": dashboard["placement_reasons"],
        "insights": dashboard["insights"],
        "alerts": dashboard["alerts"],
        "profile_summary": dashboard["profile_summary"],
        "subject_trends": dashboard.get("subject_trends", []),
        "marks_timeline": dashboard.get("marks_timeline", []),
        "interventions": get_student_interventions(student_id, institution_id=institution_id),
    }


def get_classroom_roster(subject_id, department=None, search=None, institution_id=None):
    subject = get_subject_by_id(subject_id, institution_id=institution_id)

    if not subject:
        raise ValueError("Subject not found")

    effective_department = (department or "").strip()
    if not effective_department or effective_department.lower() == "all":
        effective_department = subject["department"]

    students = get_all_scored_students(
        search=search,
        department=effective_department,
        sort_order="desc",
        institution_id=institution_id,
    )

    with get_db_connection() as conn:
        ensure_attendance_table_consistency(conn)
        ensure_marks_table_consistency(conn)

        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    student_id,
                    COUNT(*) FILTER (WHERE status = 'Present') * 100.0 / NULLIF(COUNT(*), 0) AS attendance_percentage
                FROM attendance
                WHERE subject_id = %s
                GROUP BY student_id
                """,
                (subject_id,),
            )
            attendance_map = {
                row[0]: round(float(row[1] or 0), 2)
                for row in cur.fetchall()
            }

            cur.execute(
                """
                SELECT DISTINCT ON (student_id)
                    student_id,
                    marks,
                    exam_type
                FROM marks
                WHERE subject_id = %s
                ORDER BY student_id, created_at DESC NULLS LAST, id DESC
                """,
                (subject_id,),
            )
            marks_map = {
                row[0]: {
                    "marks": float(row[1]) if row[1] is not None else None,
                    "exam_type": row[2],
                }
                for row in cur.fetchall()
            }

    roster = []
    for student in students:
        latest_marks = marks_map.get(student["student_id"], {})
        roster.append({
            "student_id": student["student_id"],
            "name": student["name"],
            "email": student["email"],
            "roll_number": student["roll_number"],
            "department": student["department"],
            "attendance_percentage": attendance_map.get(student["student_id"]),
            "latest_marks": latest_marks.get("marks"),
            "latest_exam_type": latest_marks.get("exam_type"),
            "readiness_score": student["final_score"],
            "status": student["status"],
            "risk_status": student["risk_status"],
        })

    attendance_values = [
        row["attendance_percentage"]
        for row in roster
        if row["attendance_percentage"] is not None
    ]
    mark_values = [
        row["latest_marks"]
        for row in roster
        if row["latest_marks"] is not None
    ]

    return {
        "subject": subject,
        "department": effective_department,
        "count": len(roster),
        "summary": {
            "students_with_attendance": len(attendance_values),
            "students_with_marks": len(mark_values),
            "average_attendance": round(sum(attendance_values) / len(attendance_values), 2) if attendance_values else 0,
            "average_marks": round(sum(mark_values) / len(mark_values), 2) if mark_values else 0,
        },
        "roster": roster,
    }


def save_classroom_attendance(subject_id, entries, institution_id=None):
    subject = get_subject_by_id(subject_id, institution_id=institution_id)

    if not subject:
        raise ValueError("Subject not found")

    saved_count = 0

    for entry in entries or []:
        attendance_value = entry.get("attendance_percentage")
        if attendance_value in (None, ""):
            continue
        if institution_id is not None and not get_student_profile(int(entry["student_id"]), institution_id=institution_id):
            raise ValueError("Student not found")

        save_attendance_percentage(
            int(entry["student_id"]),
            int(subject_id),
            attendance_value,
        )
        saved_count += 1

    if saved_count == 0:
        raise ValueError("Provide at least one attendance value to save")

    return {
        "subject": subject,
        "saved_count": saved_count,
    }


def save_classroom_marks(subject_id, exam_type, entries, institution_id=None):
    subject = get_subject_by_id(subject_id, institution_id=institution_id)

    if not subject:
        raise ValueError("Subject not found")

    cleaned_exam_type = (exam_type or "").strip()
    if not cleaned_exam_type:
        raise ValueError("Exam type is required for class marks entry")

    saved_count = 0

    for entry in entries or []:
        marks_value = entry.get("marks")
        if marks_value in (None, ""):
            continue
        if institution_id is not None and not get_student_profile(int(entry["student_id"]), institution_id=institution_id):
            raise ValueError("Student not found")

        save_marks(
            int(entry["student_id"]),
            int(subject_id),
            marks_value,
            cleaned_exam_type,
        )
        saved_count += 1

    if saved_count == 0:
        raise ValueError("Provide at least one marks value to save")

    return {
        "subject": subject,
        "exam_type": cleaned_exam_type,
        "saved_count": saved_count,
    }
