from database import get_db_connection
from services.admin_service import get_admin_stats


def get_admin_dashboard():
    """
    Get comprehensive admin analytics dashboard with:
    - Department-wise analytics
    - Low-performing students
    - Top students
    - System-wide insights
    """
    stats = get_admin_stats()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM subjects")
            result = cur.fetchone()
            total_subjects = result[0] if result else 0

            # Get all students with scores for department-wise breakdown
            cur.execute("""
                WITH student_scores AS (
                    SELECT
                        s.id,
                        s.department,
                        COALESCE(
                            (
                                SELECT AVG(m.marks) FROM marks m WHERE m.student_id = s.id
                            ), 0
                        ) AS marks_avg,
                        COALESCE(
                            (
                                SELECT COUNT(*) FILTER (WHERE status = 'Present') * 100.0 / NULLIF(COUNT(*), 0)
                                FROM attendance a WHERE a.student_id = s.id
                            ), 0
                        ) AS attendance_score
                    FROM students s
                )
                SELECT
                    department,
                    COUNT(*) as total,
                    ROUND(AVG(marks_avg), 2) as dept_avg_marks,
                    ROUND(AVG(attendance_score), 2) as dept_avg_attendance
                FROM student_scores
                WHERE department IS NOT NULL
                GROUP BY department
                ORDER BY dept_avg_marks DESC
            """)

            department_analytics = []
            for row in cur.fetchall():
                department_analytics.append({
                    "department": row[0],
                    "student_count": row[1],
                    "avg_marks": row[2] or 0,
                    "avg_attendance": row[3] or 0,
                })

    average_score = 0
    if stats["department_average_scores"]:
        total_weighted = sum(
            item["average_score"] * item["student_count"]
            for item in stats["department_average_scores"]
        )
        total_students = sum(item["student_count"] for item in stats["department_average_scores"])
        average_score = round(total_weighted / total_students, 2) if total_students else 0

    top_student = None
    if stats["top_students_by_department"]:
        top_groups = [
            group["students"][0]
            for group in stats["top_students_by_department"]
            if group.get("students")
        ]
        if top_groups:
            top_student = sorted(top_groups, key=lambda item: item["score"], reverse=True)[0]

    # Enhance low performers with more details
    low_performers_enhanced = []
    if stats["low_performers"]:
        for student in stats["low_performers"][:15]:
            low_performers_enhanced.append({
                "student_id": student.get("student_id"),
                "name": student.get("name"),
                "email": student.get("email"),
                "roll_number": student.get("roll_number"),
                "department": student.get("department"),
                "final_score": student.get("final_score", student.get("score")),
                "attendance": student.get("attendance"),
                "marks": student.get("marks"),
                "mock_score": student.get("mock_score"),
                "risk": "Critical" if student.get("final_score", student.get("score", 0)) < 40 else "High" if student.get("final_score", student.get("score", 0)) < 60 else "Medium",
            })

    return {
        "total_students": stats["total_students"],
        "total_faculty": stats["total_faculty"],
        "total_subjects": total_subjects,
        "top_student": top_student,
        "average_score": average_score,
        "department_average_scores": stats["department_average_scores"],
        "department_analytics": department_analytics,
        "low_performers": low_performers_enhanced,
        "at_risk_count": len([s for s in stats.get("low_performers", []) if s.get("final_score", 0) < 60]),
    }
