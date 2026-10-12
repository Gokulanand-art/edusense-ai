import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, jsonify
from services.prediction_service import predict_placement_from_score
from services.student_dashboard_service import get_student_dashboard_data
from auth.auth_middleware import token_required
from auth.current_user import current_institution_id, current_is_super_admin, current_user, current_user_id
from services.student_service import get_student_profile, get_student_record_by_user_id

prediction_bp = Blueprint("prediction_bp", __name__)


@prediction_bp.route("/predict/<int:student_id>", methods=["GET"])
@token_required
def predict(student_id):
    try:
        user = current_user()
        institution_id = current_institution_id()
        if user.get("role_id") == 3:
            student = get_student_record_by_user_id(current_user_id(), institution_id=institution_id)
            if not student or student["id"] != student_id:
                return jsonify({"error": "Students can only view their own prediction"}), 403
        elif not current_is_super_admin() and not get_student_profile(student_id, institution_id=institution_id):
            return jsonify({"error": "Student not found"}), 404

        data = get_student_dashboard_data(student_id, institution_id=None if current_is_super_admin() else institution_id)

        result = predict_placement_from_score(
            student_id,
            data["readiness_score"],
            metrics={
                "attendance": data.get("attendance", 0),
                "marks": data.get("marks", 0),
                "mock_score": data.get("mock_score", 0),
                "skills_score": data.get("skills_score", 0),
            },
        )

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500
