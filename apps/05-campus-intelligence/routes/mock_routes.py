import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, request, jsonify
from services.mock_service import add_mock_test, get_mock_scores, save_mock_test
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_institution_id, current_is_super_admin, current_user, current_user_id
from services.student_service import get_student_profile, get_student_record_by_user_id
from utils.response import success_response, error_response
from utils.validators import validate_required_fields

mock_bp = Blueprint("mock_bp", __name__)


# Add mock test (Faculty only)
@mock_bp.route("/mock-tests", methods=["POST"])
@token_required
@role_required("Faculty")
def create_mock():
    try:
        data = request.get_json() or {}

        # ✅ Validation
        valid, error = validate_required_fields(data, ["student_id", "score", "test_name"])
        if not valid:
            return error_response(error)

        student_id = data["student_id"]
        score = data["score"]
        test_name = data["test_name"]
        if not get_student_profile(student_id, institution_id=current_institution_id()):
            return error_response("Student not found", 404)

        add_mock_test(student_id, score, test_name)

        return success_response(
            data = {
                "student_id": student_id,
                "score": score,
                "test_name": test_name
            },
            message="Mock test added", status=201
        )

    except Exception as e:
        return error_response(str(e), 500)


@mock_bp.route("/mock-tests", methods=["PUT"])
@token_required
@role_required("Faculty")
def update_mock():
    try:
        data = request.get_json() or {}

        valid, error = validate_required_fields(data, ["student_id", "score", "test_name"])
        if not valid:
            return error_response(error)
        if not get_student_profile(data["student_id"], institution_id=current_institution_id()):
            return error_response("Student not found", 404)

        action = save_mock_test(
            data["student_id"],
            data["score"],
            data["test_name"],
        )

        return success_response(
            data={
                "student_id": data["student_id"],
                "score": data["score"],
                "test_name": data["test_name"],
            },
            message="Mock test updated" if action == "updated" else "Mock test saved",
            status=200,
        )

    except Exception as e:
        return error_response(str(e), 500)


# Get mock tests for student
@mock_bp.route("/mock-tests/<int:student_id>", methods=["GET"])
@token_required
def fetch_mock(student_id):
    try:
        user = current_user()
        institution_id = current_institution_id()
        if user.get("role_id") == 3:
            student = get_student_record_by_user_id(current_user_id(), institution_id=institution_id)
            if not student or student["id"] != student_id:
                return jsonify({"error": "Students can only view their own mock tests"}), 403
        elif not current_is_super_admin() and not get_student_profile(student_id, institution_id=institution_id):
            return jsonify({"error": "Student not found"}), 404

        data = get_mock_scores(student_id)
        return jsonify(data), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500
