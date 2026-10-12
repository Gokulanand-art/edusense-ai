import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, request, jsonify
from services.skills_service import get_student_skills

from services.skills_service import assign_skill, get_or_create_skill
from services.student_service import get_student_record_by_user_id
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_institution_id, current_user, current_user_id

student_skill_bp = Blueprint("student_skill_bp", __name__)


@student_skill_bp.route("/student/skills", methods=["POST"])
@token_required
@role_required("Student")
def add_skill():
    try:
        data = request.get_json() or {}
        student = get_student_record_by_user_id(current_user_id(), institution_id=current_institution_id())

        if not student:
            return jsonify({"error": "Student not found"}), 404

        student_id = student["id"]
        requested_student_id = data.get("student_id")

        if requested_student_id is not None and requested_student_id != student_id:
            return jsonify({"error": "Students can only add skills to their own profile"}), 403

        skill_id = data.get("skill_id")

        if skill_id is None:
            skill_name = (data.get("skill_name") or "").strip()

            if not skill_name:
                return jsonify({"error": "skill_name or skill_id is required"}), 400

            skill_id = get_or_create_skill(skill_name)

        action = assign_skill(student_id, skill_id, data.get("skill_level") or "Intermediate")

        return jsonify({
            "message": "Skill updated successfully" if action == "updated" else "Skill added successfully",
            "student_id": student_id,
            "skill_id": skill_id,
            "skill_level": data.get("skill_level") or "Intermediate",
        }), 201

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@student_skill_bp.route("/student/skills/<int:student_id>", methods=["GET"])
@token_required
def get_skills(student_id):
    try:
        user = current_user()
        if user.get("role_id") == 3:
            student = get_student_record_by_user_id(current_user_id(), institution_id=current_institution_id())
            if not student or student["id"] != student_id:
                return jsonify({"error": "Students can only view their own skills"}), 403

        skills = get_student_skills(student_id)
        return jsonify(skills), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


# ── Admin: add skill to system catalogue ─────────────────────────────────────
@student_skill_bp.route("/skills", methods=["POST"])
@token_required
@role_required("Admin")
def create_skill_catalogue():
    """Admin adds a new skill to the institution catalogue."""
    from services.skills_service import add_skill
    try:
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        if not name:
            return jsonify({"error": "skill name is required"}), 400
        add_skill(name)
        return jsonify({"message": "Skill added to catalogue"}), 201
    except Exception as exc:
        logger.exception("create_skill_catalogue failed")
        return jsonify({"error": "An internal error occurred"}), 500


# ── Faculty: assign skill to a student ───────────────────────────────────────
@student_skill_bp.route("/faculty/student-skills", methods=["POST"])
@token_required
@role_required("Faculty")
def assign_skill_to_student():
    """Faculty assigns/endorses a skill on a student profile."""
    try:
        data = request.get_json() or {}
        if not all(k in data for k in ("student_id", "skill_id")):
            return jsonify({"error": "student_id and skill_id are required"}), 400
        action = assign_skill(data["student_id"], data["skill_id"], data.get("skill_level"))
        return jsonify({
            "message": "Skill updated" if action == "updated" else "Skill assigned",
            "skill_level": data.get("skill_level") or "Intermediate",
        }), 201
    except Exception as exc:
        logger.exception("assign_skill_to_student failed")
        return jsonify({"error": "An internal error occurred"}), 500
