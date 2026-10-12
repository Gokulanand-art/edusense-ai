import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, jsonify, request
from services.readiness_service import calculate_readiness
from auth.auth_middleware import token_required
from auth.current_user import current_institution_id, current_is_super_admin, current_user, current_user_id
from services.readiness_service import get_top_students
from services.student_service import get_student_record_by_user_id
from services.student_service import get_student_profile

readiness_bp = Blueprint("readiness_bp", __name__)


@readiness_bp.route("/readiness/<int:student_id>", methods=["GET"])
@token_required
def get_readiness(student_id):
    try:
        user = current_user()
        institution_id = current_institution_id()
        if user.get("role_id") == 3:
            student = get_student_record_by_user_id(current_user_id(), institution_id=institution_id)
            if not student or student["id"] != student_id:
                return jsonify({"error": "Students can only view their own readiness"}), 403
        elif not current_is_super_admin() and not get_student_profile(student_id, institution_id=institution_id):
            return jsonify({"error": "Student not found"}), 404

        result = calculate_readiness(student_id, institution_id=None if current_is_super_admin() else institution_id)
        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500
    

@readiness_bp.route("/top-students", methods=["GET"])
@token_required
def top_students():
    try:
        data = get_top_students(institution_id=None if current_is_super_admin() else current_institution_id())
        return jsonify(data), 200
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@readiness_bp.route("/leaderboard")
@token_required
def leaderboard_page():
    """Render the leaderboard page."""
    from flask import render_template
    return render_template("leaderboard.html")


@readiness_bp.route("/api/leaderboard", methods=["GET"])
@token_required
def api_leaderboard():
    """
    Leaderboard API: top students by readiness score.
    Query params: limit (default 25), department (optional)
    Returns: ranked list + calling student's rank (if role=Student)
    """
    from flask import g

    limit      = min(int(request.args.get("limit", 25)), 100)
    department = request.args.get("department")
    institution_id = g.institution_id

    try:
        all_students = get_top_students(institution_id=institution_id)

        # Filter by dept if requested
        if department:
            all_students = [s for s in all_students if (s.get("department") or "") == department]

        # Unique departments list
        departments = sorted({s.get("department","") for s in all_students if s.get("department")})

        # Find calling student's position (for Student role)
        my_student_id = None
        my_rank = None
        role = (g.user_role or "").lower()
        if role == "student":
            from services.student_service import get_student_record_by_user_id
            stu = get_student_record_by_user_id(g.user["id"], institution_id=institution_id)
            if stu:
                my_student_id = stu["id"]
                for i, s in enumerate(all_students):
                    if s.get("student_id") == my_student_id or s.get("id") == my_student_id:
                        my_rank = i + 1
                        break

        top = all_students[:limit]
        return jsonify({
            "success": True,
            "data": {
                "students":    top,
                "departments": departments,
                "total":       len(all_students),
                "my_rank":     my_rank,
                "my_student_id": my_student_id,
            }
        }), 200
    except Exception as exc:
        logger.exception("api_leaderboard failed")
        return jsonify({"success": False, "error": "Failed to load leaderboard"}), 500
