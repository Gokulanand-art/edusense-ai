import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, request, jsonify
from services.marks_service import add_marks, get_marks, save_marks
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_user
from utils.validators import RequestValidator
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

marks_bp = Blueprint("marks_bp", __name__)


@marks_bp.route("/marks", methods=["POST"])
@token_required
@role_required("Faculty")
def create_marks():
    try:
        v = RequestValidator(request.get_json())
        v.required("student_id", "subject_id", "marks").integer("student_id").integer("subject_id").integer("marks", min_val=0, max_val=100)
        if v.has_errors():
            return jsonify({"error": v.first_error()}), 400
        student_id = v.validated_data["student_id"]
        subject_id = v.validated_data["subject_id"]
        marks_value = v.validated_data["marks"]
        exam_type = v.data.get("exam_type")

        add_marks(student_id, subject_id, marks_value, exam_type)

        return jsonify({"message": "Marks added successfully"}), 201

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@marks_bp.route("/marks", methods=["PUT"])
@token_required
@role_required("Faculty")
def update_marks():
    try:
        v = RequestValidator(request.get_json())
        v.required("student_id", "subject_id", "marks").integer("student_id").integer("subject_id").integer("marks", min_val=0, max_val=100)
        if v.has_errors():
            return jsonify({"error": v.first_error()}), 400
        action = save_marks(
            v.validated_data["student_id"],
            v.validated_data["subject_id"],
            v.validated_data["marks"],
            v.data.get("exam_type"),
        )

        return jsonify({
            "message": "Marks updated successfully" if action == "updated" else "Marks saved successfully"
        }), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@marks_bp.route("/marks", methods=["GET"])
@token_required
def fetch_marks():
    try:
        user = current_user()
        if not user or user.get("role_id") not in (1, 2):
            return jsonify({"error": "Access denied"}), 403

        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        # Get all marks
        all_marks = get_marks()
        
        # Apply pagination
        page = params['page']
        per_page = params['per_page']
        total = len(all_marks) if all_marks else 0
        offset = (page - 1) * per_page
        marks = all_marks[offset:offset + per_page] if all_marks else []
        
        response = PaginationHelper.paginate(marks, total, page, per_page)
        return jsonify(response), 200

    except Exception as e:
        logger.exception("fetch_marks failed")
        error_resp, status_code = create_error_response("SERVER_ERROR", "An internal error occurred", 500)
        return jsonify(error_resp), status_code


@marks_bp.route("/marks/bulk", methods=["POST"])
@token_required
@role_required("Admin", "Faculty")
def bulk_save_marks():
    """
    Bulk marks save — accepts an array of {student_id, subject_id, marks, exam_type}.
    Used by the faculty spreadsheet-style marks entry grid.
    Processes each row independently so partial success is reported back.
    """
    from flask import g
    data = request.get_json(silent=True) or {}
    entries = data.get("entries", [])

    if not entries or not isinstance(entries, list):
        return jsonify({"success": False, "error": "entries array is required"}), 400
    if len(entries) > 200:
        return jsonify({"success": False, "error": "Max 200 entries per bulk request"}), 400

    saved, failed = 0, []
    for entry in entries:
        try:
            sid  = int(entry.get("student_id", 0))
            subj = int(entry.get("subject_id", 0))
            m    = int(entry.get("marks", -1))
            if sid <= 0 or subj <= 0 or m < 0 or m > 100:
                failed.append({"student_id": sid, "error": "Invalid values"})
                continue
            save_marks(sid, subj, m, entry.get("exam_type", "internal"))
            saved += 1
        except Exception as exc:
            failed.append({"student_id": entry.get("student_id"), "error": str(exc)})

    return jsonify({
        "success": True,
        "saved": saved,
        "failed": failed,
        "message": f"Saved {saved} records" + (f", {len(failed)} failed" if failed else ""),
    })
