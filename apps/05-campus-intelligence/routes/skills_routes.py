import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, request, jsonify
from services.skills_service import add_skill, assign_skill, get_student_skills
from services.student_service import get_student_profile, get_student_record_by_user_id
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_institution_id, current_user_id

skills_bp = Blueprint("skills_bp", __name__)


@skills_bp.route("/skills", methods=["POST"])
@token_required
@role_required("Admin")
def create_skill():
    try:
        data = request.get_json()
        name = data["name"]

        add_skill(name)

        return jsonify({"message": "Skill added"}), 201

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@skills_bp.route("/faculty/student-skills", methods=["POST"])
@token_required
@role_required("Faculty")
def assign_skill_to_student():
    try:
        data = request.get_json() or {}
        if not all(key in data for key in ("student_id", "skill_id")):
            return jsonify({"error": "Missing fields"}), 400

        student_id = data["student_id"]
        skill_id = data["skill_id"]
        if not get_student_profile(student_id, institution_id=current_institution_id()):
            return jsonify({"error": "Student not found"}), 404

        action = assign_skill(student_id, skill_id, data.get("skill_level"))

        return jsonify({
            "message": "Skill updated" if action == "updated" else "Skill assigned",
            "skill_level": data.get("skill_level") or "Intermediate",
        }), 201

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@skills_bp.route("/student/skills", methods=["GET"])
@token_required
@role_required("Student")
def get_my_skills():
    try:
        student = get_student_record_by_user_id(current_user_id(), institution_id=current_institution_id())

        if not student:
            return jsonify({"error": "Student not found"}), 404

        return jsonify(get_student_skills(student["id"])), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500
