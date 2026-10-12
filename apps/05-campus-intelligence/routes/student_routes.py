from flask import Blueprint, jsonify, request
import logging

from services.student_dashboard_service import get_student_dashboard_data
from services.student_service import (
    DuplicateStudentError,
    StudentNotFoundError,
    create_student_record,
    delete_student_record,
    ensure_student_table_consistency,
    fetch_all_students,
    get_student_record_by_user_id,
    get_student_profile,
    update_student_record,
)
from services.marks_service import get_subject_wise_marks, get_marks_by_student
from services.attendance_service import get_attendance
from services.skills_service import get_student_skills
from auth.current_user import current_institution_id, current_user, current_user_id
from auth.auth_middleware import token_required, role_required
from utils.validators import RequestValidator
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response
from services.audit_service import record_audit_event

logger = logging.getLogger(__name__)
student_bp = Blueprint("student_bp", __name__)


def _call_with_institution(func, *args, institution_id=None, **kwargs):
    try:
        return func(*args, institution_id=institution_id, **kwargs)
    except TypeError as exc:
        if "institution_id" not in str(exc):
            raise
        return func(*args, **kwargs)


@student_bp.route("/students")
@token_required
@role_required("Admin")
def get_students():
    try:
        institution_id = current_institution_id()
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        # Get all students
        all_students = _call_with_institution(
            fetch_all_students,
            institution_id=institution_id,
        )
        
        # Apply pagination
        page = params['page']
        per_page = params['per_page']
        total = len(all_students)
        offset = (page - 1) * per_page
        students = all_students[offset:offset + per_page]
        
        response = PaginationHelper.paginate(students, total, page, per_page)
        return jsonify(response), 200
    except Exception as e:
        logger.exception("get_students failed")
        error_resp, status_code = create_error_response("SERVER_ERROR", "An internal error occurred", 500)
        return jsonify(error_resp), status_code


@student_bp.route("/create-table")
@token_required
@role_required("Admin")
def create_table():
    try:
        ensure_student_table_consistency()
        return jsonify({"message": "Students table verified"}), 200
    except Exception as e:
        logger.exception("create_table failed")
        return jsonify({"error": "Failed to verify students table"}), 500


def _validate_student_payload(data):
    validator = RequestValidator(data)
    validator.required("name", "email", "department", "roll_number") \
        .sanitize("name", 100).email("email") \
        .sanitize("department", 100).roll_number("roll_number")
    return validator


@student_bp.route("/add-student", methods=["POST"])
@token_required
@role_required("Admin")
def add_student():
    try:
        user = current_user()
        validator = _validate_student_payload(request.get_json() or {})
        if validator.has_errors():
            return jsonify({"error": validator.first_error()}), 400

        student = create_student_record(
            validator.validated_data["name"],
            validator.validated_data["email"],
            validator.validated_data["department"],
            validator.validated_data["roll_number"],
            institution_id=user.get("institution_id"),
        )
        record_audit_event(
            "student.created",
            actor_user_id=user.get("user_id"),
            institution_id=user.get("institution_id"),
            entity_type="student",
            entity_id=student.get("id"),
            metadata={"email": student.get("email"), "department": student.get("department")},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )

        return jsonify({
            "message": "Student added successfully",
            "student": student,
        }), 201

    except DuplicateStudentError as e:
        return jsonify({"error": str(e)}), 409
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("add_student failed")
        return jsonify({"error": "Failed to add student"}), 500


@student_bp.route("/update-student/<int:student_id>", methods=["PUT"])
@token_required
@role_required("Admin")
def update_student(student_id):
    try:
        user = current_user()
        validator = _validate_student_payload(request.get_json() or {})
        if validator.has_errors():
            return jsonify({"error": validator.first_error()}), 400

        student = update_student_record(
            student_id,
            validator.validated_data["name"],
            validator.validated_data["email"],
            validator.validated_data["department"],
            validator.validated_data["roll_number"],
            institution_id=user.get("institution_id"),
        )
        record_audit_event(
            "student.updated",
            actor_user_id=user.get("user_id"),
            institution_id=user.get("institution_id"),
            entity_type="student",
            entity_id=student_id,
            metadata={"email": student.get("email"), "department": student.get("department")},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )

        return jsonify({
            "message": "Student updated successfully",
            "student": student,
        }), 200

    except StudentNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except DuplicateStudentError as e:
        return jsonify({"error": str(e)}), 409
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("update_student failed")
        return jsonify({"error": "Failed to update student"}), 500


@student_bp.route("/delete-student/<int:student_id>", methods=["DELETE"])
@token_required
@role_required("Admin")
def delete_student(student_id):
    try:
        user = current_user()
        student = delete_student_record(student_id, institution_id=user.get("institution_id"))
        record_audit_event(
            "student.deleted",
            actor_user_id=user.get("user_id"),
            institution_id=user.get("institution_id"),
            entity_type="student",
            entity_id=student_id,
            metadata={"email": student.get("email"), "department": student.get("department")},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify({
            "message": "Student deleted successfully",
            "student": student,
        }), 200

    except StudentNotFoundError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        logger.exception("delete_student failed")
        return jsonify({"error": "Failed to delete student"}), 500


@student_bp.route("/student/dashboard", methods=["GET"])
@token_required
@role_required("Student")
def student_dashboard_api():
    try:
        institution_id = current_institution_id()
        student = _call_with_institution(
            get_student_record_by_user_id,
            current_user_id(),
            institution_id=institution_id,
        )

        if not student:
            return jsonify({"error": "Student not found"}), 404

        return jsonify(_call_with_institution(
            get_student_dashboard_data,
            student["id"],
            institution_id=institution_id,
        )), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@student_bp.route("/student/profile", methods=["GET"])
@token_required
@role_required("Student")
def student_profile_api():
    """
    Get comprehensive student profile with all academic and skill data.
    Includes: basic info, performance summary, subject performance, marks history, skills
    """
    try:
        institution_id = current_institution_id()
        student = get_student_record_by_user_id(current_user_id(), institution_id=institution_id)

        if not student:
            return jsonify({"error": "Student not found"}), 404

        student_id = student["id"]
        dashboard = get_student_dashboard_data(student_id, institution_id=institution_id)

        return jsonify({
            "profile": get_student_profile(student_id, institution_id=institution_id),
            "performance_summary": {
                "readiness_score": dashboard["readiness_score"],
                "status": dashboard["status"],
                "risk_level": dashboard["risk_level"],
                "attendance": dashboard["attendance"],
                "marks": dashboard["marks"],
                "mock_score": dashboard["mock_score"],
                "skills_score": dashboard["skills_score"],
            },
            "subject_performance": get_subject_wise_marks(student_id, institution_id=institution_id),
            "marks_history": get_marks_by_student(student_id, institution_id=institution_id)[:10],
            "attendance_summary": {
                "attendance_percentage": dashboard["attendance"],
                "recent_records": get_attendance(student_id)[:5],
            },
            "skills": {
                "count": dashboard["skills_count"],
                "score": dashboard["skills_score"],
                "skills_list": get_student_skills(student_id),
            },
            "alerts": dashboard["alerts"],
            "insights": dashboard["insights"],
        }), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@student_bp.route("/skill-gap")
@token_required
@role_required("Student")
def skill_gap_page():
    """Render the student skill gap analysis page."""
    from flask import render_template
    return render_template("skill_gap.html")


@student_bp.route("/student/placements")
@token_required
@role_required("Student")
def my_placement_outcomes():
    """Get current student's own placement outcomes."""
    from flask import g
    from services.placement_statistics_service import get_student_outcomes
    from services.student_service import get_student_record_by_user_id
    try:
        student = get_student_record_by_user_id(g.user["id"], institution_id=g.institution_id)
        if not student:
            return jsonify({"success": False, "error": "Student record not found"}), 404
        outcomes = get_student_outcomes(student["id"], g.institution_id)
        return jsonify({"success": True, "data": outcomes})
    except Exception as exc:
        logger.exception("Failed to fetch student placements")
        return jsonify({"success": False, "error": str(exc)}), 500


@student_bp.route("/leaderboard")
@token_required
def leaderboard_page():
    """Render the campus leaderboard — visible to Student, Faculty, Admin."""
    from flask import render_template
    return render_template("leaderboard.html")


@student_bp.route("/leaderboard/data")
@token_required
def leaderboard_data():
    """JSON data for the leaderboard — top 50 overall + per-department toppers."""
    from flask import g
    from services.readiness_service import get_top_students, get_top_students_by_department
    try:
        top_overall = get_top_students(limit=50, institution_id=g.institution_id)
        top_by_dept = get_top_students_by_department(limit_per_department=3, institution_id=g.institution_id)
        return jsonify({
            "success": True,
            "data": {
                "overall": top_overall,
                "by_department": top_by_dept,
            }
        })
    except Exception as exc:
        logger.exception("leaderboard data error")
        return jsonify({"success": False, "error": str(exc)}), 500
