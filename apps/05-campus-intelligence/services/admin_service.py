import csv
from datetime import date
from io import StringIO

from database import get_db_connection
from services.attendance_service import ensure_attendance_table_consistency
from services.marks_service import ensure_marks_table_consistency
from services.readiness_service import (
    get_department_average_scores,
    get_low_performing_students,
    get_top_students_by_department,
)
from services.student_service import create_student_record


def import_students_from_csv(csv_content, institution_id=None):
    reader = csv.DictReader(StringIO(csv_content or ""))
    required = {"name", "email", "department", "roll_number"}
    if not reader.fieldnames or not required.issubset({field.strip() for field in reader.fieldnames}):
        raise ValueError("CSV must include name, email, department, and roll_number columns")

    imported = []
    errors = []

    for index, row in enumerate(reader, start=2):
        try:
            student = create_student_record(
                (row.get("name") or "").strip(),
                (row.get("email") or "").strip(),
                (row.get("department") or "").strip(),
                (row.get("roll_number") or "").strip(),
                institution_id=institution_id,
            )
            imported.append(student)
        except Exception as exc:
            errors.append({"row": index, "error": str(exc)})

    return {
        "imported_count": len(imported),
        "error_count": len(errors),
        "imported": imported,
        "errors": errors,
    }
from services.student_service import (
    ensure_student_table_consistency,
    get_all_departments,
    get_department_catalog,
)
from services.subject_service import ensure_subject_table_consistency


def _ensure_admin_reporting_tables(connection):
    ensure_student_table_consistency(connection)
    ensure_subject_table_consistency(connection)
    ensure_marks_table_consistency(connection)
    ensure_attendance_table_consistency(connection)


def _build_csv_content(headers, rows):
    buffer = StringIO()
    writer = csv.writer(buffer)
    writer.writerow(headers)
    writer.writerows(rows)
    return buffer.getvalue()


def get_admin_stats(institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if institution_id is None:
                cur.execute("SELECT COUNT(*) FROM students")
            else:
                cur.execute("SELECT COUNT(*) FROM students WHERE institution_id = %s", (institution_id,))
            total_students = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM users u
                JOIN roles r ON u.role_id = r.id
                WHERE LOWER(r.role_name) = 'faculty'
                  AND (%s IS NULL OR u.institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            total_faculty = cur.fetchone()[0]

            if institution_id is None:
                cur.execute("SELECT COUNT(*) FROM users")
            else:
                cur.execute("SELECT COUNT(*) FROM users WHERE institution_id = %s", (institution_id,))
            total_users = cur.fetchone()[0]

    department_average_scores = get_department_average_scores(institution_id=institution_id)

    return {
        "total_students": total_students,
        "total_faculty": total_faculty,
        "total_users": total_users,
        "total_departments": len(get_department_catalog(institution_id=institution_id)),
        "top_students_by_department": get_top_students_by_department(institution_id=institution_id),
        "low_performers": get_low_performing_students(institution_id=institution_id),
        "department_average_scores": department_average_scores,
        "departments": [item["department"] for item in department_average_scores] or get_all_departments(institution_id=institution_id),
    }


def get_all_users(institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    u.id,
                    u.name,
                    u.email,
                    r.role_name,
                    COALESCE(i.name, 'Default Campus') AS institution_name,
                    COALESCE(u.is_super_admin, FALSE) AS is_super_admin
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                LEFT JOIN institutions i ON u.institution_id = i.id
                WHERE (%s IS NULL OR u.institution_id = %s)
                ORDER BY u.id ASC
                """,
                (institution_id, institution_id),
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "name": row[1],
            "email": row[2],
            "role": row[3] or "Unknown",
            "institution_name": row[4],
            "is_super_admin": row[5],
        }
        for row in rows
    ]


def get_operations_snapshot(institution_id=None):
    with get_db_connection() as conn:
        _ensure_admin_reporting_tables(conn)

        with conn.cursor() as cur:
            if institution_id is None:
                cur.execute("SELECT COUNT(*) FROM departments")
            else:
                cur.execute("SELECT COUNT(*) FROM departments WHERE institution_id = %s", (institution_id,))
            total_departments = cur.fetchone()[0]

            if institution_id is None:
                cur.execute("SELECT COUNT(*) FROM subjects")
            else:
                cur.execute("SELECT COUNT(*) FROM subjects WHERE institution_id = %s", (institution_id,))
            total_subjects = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM departments d
                LEFT JOIN subjects sub ON sub.department = d.name AND sub.institution_id = d.institution_id
                WHERE sub.id IS NULL
                  AND (%s IS NULL OR d.institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            departments_without_subjects = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM subjects sub
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM marks m
                    WHERE m.subject_id = sub.id
                )
                  AND (%s IS NULL OR sub.institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            subjects_without_marks = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM subjects sub
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM attendance a
                    WHERE a.subject_id = sub.id
                )
                  AND (%s IS NULL OR sub.institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            subjects_without_attendance = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM marks
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                """
            )
            marks_updates_last_7_days = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM attendance
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                """
            )
            attendance_updates_last_7_days = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM students
                WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '30 days'
                  AND (%s IS NULL OR institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            new_students_last_30_days = cur.fetchone()[0]

    low_performers = get_low_performing_students(institution_id=institution_id)
    critical_interventions = sum(
        1 for student in low_performers if float(student.get("final_score") or student.get("score") or 0) < 45
    )
    support_watchlist = max(0, len(low_performers) - critical_interventions)

    issue_total = (
        departments_without_subjects
        + subjects_without_marks
        + subjects_without_attendance
        + critical_interventions
    )

    if issue_total == 0:
        status = "Operationally Healthy"
    elif critical_interventions == 0 and issue_total <= max(3, total_subjects // 2):
        status = "Review This Week"
    else:
        status = "Action Needed"

    return {
        "status": status,
        "total_departments": total_departments,
        "total_subjects": total_subjects,
        "critical_interventions": critical_interventions,
        "support_watchlist": support_watchlist,
        "departments_without_subjects": departments_without_subjects,
        "subjects_without_marks": subjects_without_marks,
        "subjects_without_attendance": subjects_without_attendance,
        "marks_updates_last_7_days": marks_updates_last_7_days,
        "attendance_updates_last_7_days": attendance_updates_last_7_days,
        "new_students_last_30_days": new_students_last_30_days,
        "export_count": 4,
    }


def get_data_quality_snapshot(institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            if institution_id is None:
                cur.execute("SELECT COUNT(*) FROM students")
            else:
                cur.execute("SELECT COUNT(*) FROM students WHERE institution_id = %s", (institution_id,))
            total_students = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM students
                WHERE roll_number IS NULL OR TRIM(roll_number) = ''
                  AND (%s IS NULL OR institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            missing_roll_numbers = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM students
                WHERE department IS NULL OR TRIM(department) = ''
                  AND (%s IS NULL OR institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            missing_departments = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM (
                    SELECT UPPER(TRIM(roll_number))
                    FROM students
                    WHERE roll_number IS NOT NULL AND TRIM(roll_number) <> ''
                      AND (%s IS NULL OR institution_id = %s)
                    GROUP BY UPPER(TRIM(roll_number))
                    HAVING COUNT(*) > 1
                ) duplicate_roll_numbers
                """
                ,
                (institution_id, institution_id),
            )
            duplicate_roll_number_groups = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM (
                    SELECT LOWER(email)
                    FROM users
                    WHERE email IS NOT NULL AND TRIM(email) <> ''
                      AND (%s IS NULL OR institution_id = %s)
                    GROUP BY LOWER(email)
                    HAVING COUNT(*) > 1
                ) duplicate_user_emails
                """
                ,
                (institution_id, institution_id),
            )
            duplicate_user_email_groups = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM students s
                LEFT JOIN users u ON s.user_id = u.id
                WHERE s.user_id IS NOT NULL AND u.id IS NULL
                  AND (%s IS NULL OR s.institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            orphan_student_links = cur.fetchone()[0]

            cur.execute(
                """
                SELECT COUNT(*)
                FROM students s
                WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id = s.id)
                  AND NOT EXISTS (SELECT 1 FROM marks m WHERE m.student_id = s.id)
                  AND NOT EXISTS (SELECT 1 FROM mock_tests mt WHERE mt.student_id = s.id)
                  AND NOT EXISTS (SELECT 1 FROM student_skills sk WHERE sk.student_id = s.id)
                  AND (%s IS NULL OR s.institution_id = %s)
                """
                ,
                (institution_id, institution_id),
            )
            students_without_activity = cur.fetchone()[0]

    issue_total = (
        missing_roll_numbers
        + missing_departments
        + duplicate_roll_number_groups
        + duplicate_user_email_groups
        + orphan_student_links
        + students_without_activity
    )

    if issue_total == 0:
        status = "Healthy"
    elif issue_total <= max(3, total_students // 10):
        status = "Needs Review"
    else:
        status = "Attention Needed"

    return {
        "status": status,
        "total_students": total_students,
        "missing_roll_numbers": missing_roll_numbers,
        "missing_departments": missing_departments,
        "duplicate_roll_number_groups": duplicate_roll_number_groups,
        "duplicate_user_email_groups": duplicate_user_email_groups,
        "orphan_student_links": orphan_student_links,
        "students_without_activity": students_without_activity,
        "issue_total": issue_total,
    }


def build_admin_export(export_name, institution_id=None):
    export_key = (export_name or "").strip().lower()

    if export_key == "students":
        with get_db_connection() as conn:
            _ensure_admin_reporting_tables(conn)

            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        s.id,
                        s.user_id,
                        COALESCE(NULLIF(s.name, ''), u.name, '') AS name,
                        COALESCE(NULLIF(s.email, ''), u.email, '') AS email,
                        COALESCE(s.roll_number, '') AS roll_number,
                        COALESCE(s.department, '') AS department,
                        s.created_at,
                        s.updated_at
                    FROM students s
                    LEFT JOIN users u ON s.user_id = u.id
                    WHERE (%s IS NULL OR s.institution_id = %s)
                    ORDER BY
                        COALESCE(NULLIF(s.department, ''), 'ZZZ') ASC,
                        COALESCE(NULLIF(s.name, ''), u.name, '') ASC,
                        s.id ASC
                    """,
                    (institution_id, institution_id),
                )
                rows = cur.fetchall()

        return {
            "filename": f"students-master-{date.today().isoformat()}.csv",
            "content": _build_csv_content(
                [
                    "student_id",
                    "user_id",
                    "name",
                    "email",
                    "roll_number",
                    "department",
                    "created_at",
                    "updated_at",
                ],
                rows,
            ),
        }

    if export_key == "users":
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        u.id,
                        u.name,
                        u.email,
                        COALESCE(r.role_name, 'Unknown') AS role
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    WHERE (%s IS NULL OR u.institution_id = %s)
                    ORDER BY role ASC, u.name ASC, u.id ASC
                    """,
                    (institution_id, institution_id),
                )
                rows = cur.fetchall()

        return {
            "filename": f"users-and-roles-{date.today().isoformat()}.csv",
            "content": _build_csv_content(
                ["user_id", "name", "email", "role"],
                rows,
            ),
        }

    if export_key == "subjects":
        with get_db_connection() as conn:
            _ensure_admin_reporting_tables(conn)

            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        name,
                        code,
                        department,
                        created_at
                    FROM subjects
                    WHERE (%s IS NULL OR institution_id = %s)
                    ORDER BY department ASC, name ASC, id ASC
                    """,
                    (institution_id, institution_id),
                )
                rows = cur.fetchall()

        return {
            "filename": f"subject-catalog-{date.today().isoformat()}.csv",
            "content": _build_csv_content(
                ["subject_id", "name", "code", "department", "created_at"],
                rows,
            ),
        }

    if export_key == "interventions":
        low_performers = get_low_performing_students(institution_id=institution_id)
        rows = [
            [
                student.get("student_id"),
                student.get("name"),
                student.get("email"),
                student.get("roll_number"),
                student.get("department"),
                student.get("attendance"),
                student.get("marks"),
                student.get("skills_count"),
                student.get("skills_score"),
                student.get("mock_score"),
                student.get("final_score") or student.get("score"),
                "Critical" if float(student.get("final_score") or student.get("score") or 0) < 45 else "Support",
                max(0, round(60 - float(student.get("final_score") or student.get("score") or 0), 2)),
            ]
            for student in low_performers
        ]

        return {
            "filename": f"student-interventions-{date.today().isoformat()}.csv",
            "content": _build_csv_content(
                [
                    "student_id",
                    "name",
                    "email",
                    "roll_number",
                    "department",
                    "attendance",
                    "marks",
                    "skills_count",
                    "skills_score",
                    "mock_score",
                    "readiness_score",
                    "intervention_level",
                    "points_to_reach_60",
                ],
                rows,
            ),
        }

    raise ValueError("Unknown export requested")


def delete_user(user_id, current_user_id=None, institution_id=None):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT u.id, u.email, COALESCE(r.role_name, '')
                FROM users u
                LEFT JOIN roles r ON u.role_id = r.id
                WHERE u.id = %s
                  AND (%s IS NULL OR u.institution_id = %s)
                """,
                (user_id, institution_id, institution_id),
            )
            user = cur.fetchone()

            if not user:
                raise ValueError("User not found")

            if current_user_id is not None and int(user_id) == int(current_user_id):
                raise ValueError("You cannot delete your own account")

            role_name = (user[2] or "").strip().lower()

            if role_name == "admin":
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM users u
                    JOIN roles r ON u.role_id = r.id
                    WHERE LOWER(r.role_name) = 'admin'
                      AND (%s IS NULL OR u.institution_id = %s)
                    """
                    ,
                    (institution_id, institution_id),
                )
                admin_count = cur.fetchone()[0]

                if admin_count <= 1:
                    raise ValueError("At least one admin account must remain in the system")

            cur.execute(
                """
                SELECT id
                FROM students
                WHERE (user_id = %s OR LOWER(email) = LOWER(%s))
                  AND (%s IS NULL OR institution_id = %s)
                ORDER BY id ASC
                """,
                (user_id, user[1], institution_id, institution_id),
            )
            student_ids = [row[0] for row in cur.fetchall()]

            for student_id in student_ids:
                cur.execute("DELETE FROM attendance WHERE student_id = %s", (student_id,))
                cur.execute("DELETE FROM marks WHERE student_id = %s", (student_id,))
                cur.execute("DELETE FROM mock_tests WHERE student_id = %s", (student_id,))
                cur.execute("DELETE FROM student_skills WHERE student_id = %s", (student_id,))

            if student_ids:
                cur.execute(
                    """
                    DELETE FROM students
                    WHERE (user_id = %s OR LOWER(email) = LOWER(%s))
                      AND (%s IS NULL OR institution_id = %s)
                    """,
                    (user_id, user[1], institution_id, institution_id),
                )

            if institution_id is None:
                cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
            else:
                cur.execute("DELETE FROM users WHERE id = %s AND institution_id = %s", (user_id, institution_id))
            deleted = cur.rowcount

    if not deleted:
        raise ValueError("User could not be deleted")

    return {
        "id": user[0],
        "email": user[1],
        "role": user[2] or "Unknown",
    }
import csv
import io
