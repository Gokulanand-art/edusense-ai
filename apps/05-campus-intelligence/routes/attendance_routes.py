import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, request, jsonify
from services.attendance_service import (
    mark_attendance,
    get_attendance,
    save_attendance_percentage,
)
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_institution_id, current_user_id
from utils.validators import RequestValidator
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

from services.student_service import get_student_profile, get_student_record_by_user_id

attendance_bp = Blueprint("attendance_bp", __name__)


# ✅ ADD ATTENDANCE (FACULTY ONLY)
@attendance_bp.route("/faculty/attendance", methods=["POST"])
@token_required
@role_required("Faculty")
def add_attendance():
    try:
        data = request.get_json() or {}
        v = RequestValidator(data)
        v.required("student_id", "subject_id").integer("student_id").integer("subject_id")
        
        if "attendance_percentage" in data:
            v.float_num("attendance_percentage", 0, 100)
            
        if v.has_errors():
            return jsonify({"error": v.first_error()}), 400

        student_id = v.validated_data["student_id"]
        subject_id = v.validated_data["subject_id"]
        if not get_student_profile(student_id, institution_id=current_institution_id()):
            return jsonify({"error": "Student not found"}), 404

        if "attendance_percentage" in v.validated_data:
            perc = v.validated_data["attendance_percentage"]
            save_attendance_percentage(student_id, subject_id, perc)
            return jsonify({
                "message": "Attendance percentage saved successfully",
                "student_id": student_id,
                "subject_id": subject_id,
                "attendance_percentage": int(round(perc)),
            }), 200

        if "status" not in data:
            return jsonify({"error": "status or attendance_percentage is required"}), 400

        status = str(data["status"]).capitalize()

        # 🔹 Insert (date auto handled by DB)
        mark_attendance(student_id, subject_id, status)

        return jsonify({"message": "Attendance marked successfully"}), 201

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


# ✅ VIEW ATTENDANCE (STUDENT ONLY)
@attendance_bp.route("/student/attendance", methods=["GET"])
@token_required
@role_required("Student")
def view_attendance():
    try:
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        student = get_student_record_by_user_id(current_user_id(), institution_id=current_institution_id())
        if not student:
            return jsonify({"error": "Student not found"}), 404

        all_attendance = get_attendance(student["id"])

        # Apply pagination
        page = params['page']
        per_page = params['per_page']
        total = len(all_attendance) if all_attendance else 0
        offset = (page - 1) * per_page
        attendance = all_attendance[offset:offset + per_page] if all_attendance else []
        
        response = PaginationHelper.paginate(attendance, total, page, per_page)
        return jsonify(response), 200

    except Exception as e:
        logger.exception("view_attendance failed")
        error_resp, status_code = create_error_response("SERVER_ERROR", "An internal error occurred", 500)
        return jsonify(error_resp), status_code
