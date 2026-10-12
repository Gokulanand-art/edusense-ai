import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, request, jsonify
from services.subject_service import create_subject, get_all_subjects
from auth.auth_middleware import token_required, role_required

subject_bp = Blueprint("subject_bp", __name__)


@subject_bp.route("/subjects", methods=["POST"])
@token_required
@role_required("Admin")
def add_subject():
    try:
        data = request.get_json()

        name = data.get("name")
        code = data.get("code")
        department = data.get("department")

        # ✅ Validation
        if not name or not code or not department:
            return jsonify({"error": "name, code, and department are required"}), 400

        create_subject(name, code, department)

        return jsonify({"message": "Subject added successfully"}), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@subject_bp.route("/subjects", methods=["GET"])
@token_required
def get_subjects():
    try:
        subjects = get_all_subjects()
        return jsonify(subjects), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500
