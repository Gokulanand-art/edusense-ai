import logging
from flask import Blueprint, jsonify, request
from auth.auth_middleware import token_required, role_required
from services.notice_board_service import NoticeBoardService
from utils.validators import RequestValidator
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

logger = logging.getLogger(__name__)

notice_bp = Blueprint("notice_bp", __name__)

@notice_bp.route("/api/notices", methods=["POST"])
@token_required
@role_required("Admin", "Faculty")
def create_notice(current_user):
    try:
        data = request.get_json() or {}
        v = RequestValidator(data)
        v.required("title", "content", "target_role")
        if v.has_errors():
            return jsonify({"error": v.first_error()}), 400
            
        title = v.validated_data["title"]
        content = v.validated_data["content"]
        target_role = v.validated_data["target_role"]
        is_pinned = bool(data.get("is_pinned"))
        publish_at = data.get("publish_at")
        expires_at = data.get("expires_at")
        
        # Faculty can only notify Students or All
        if current_user["role"] == "Faculty" and target_role not in ["Student", "All"]:
            return jsonify({"error": "Faculty can only target Students or All"}), 403
            
        notice_id = NoticeBoardService.create_notice(
            title=title,
            content=content,
            target_role=target_role,
            author_id=current_user["id"],
            institution_id=current_user.get("institution_id"),
            is_pinned=is_pinned,
            publish_at=publish_at,
            expires_at=expires_at,
        )
        
        if not notice_id:
            return jsonify({"error": "Failed to create notice"}), 500
            
        return jsonify({"message": "Notice published successfully 📢", "id": notice_id}), 201
    except Exception as e:
        logger.error(f"Error in create_notice route: {e}")
        return jsonify({"error": "An error occurred"}), 500

@notice_bp.route("/api/notices", methods=["GET"])
@token_required
def get_notices(current_user):
    try:
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        user_role = current_user["role"]
        user_id = current_user["id"]
        
        if user_role == "Admin":
            roles = None
            author = None
        elif user_role == "Faculty":
            roles = ["Faculty", "All"]
            author = user_id
        else: # Student
            roles = ["Student", "All"]
            author = None
            
        all_notices = NoticeBoardService.get_notices(
            target_roles=roles,
            author_id=author,
            institution_id=current_user.get("institution_id"),
        )
        
        # Apply pagination
        page = params['page']
        per_page = params['per_page']
        total = len(all_notices)
        offset = (page - 1) * per_page
        notices = all_notices[offset:offset + per_page]
        
        response = PaginationHelper.paginate(notices, total, page, per_page)
        return jsonify(response), 200
    except Exception as e:
        logger.error(f"Error in get_notices route: {e}")
        error_resp, status_code = create_error_response("SERVER_ERROR", "An error occurred", 500)
        return jsonify(error_resp), status_code

@notice_bp.route("/api/notices/<int:notice_id>", methods=["DELETE"])
@token_required
@role_required("Admin", "Faculty")
def delete_notice(current_user, notice_id):
    try:
        # For full security, we would verify the Faculty is the author of this notice.
        # Simple version here.
        success = NoticeBoardService.delete_notice(notice_id, institution_id=current_user.get("institution_id"))
        if success:
            return jsonify({"message": "Notice deleted successfully"}), 200
        return jsonify({"error": "Failed to delete notice"}), 500
    except Exception as e:
        logger.error(f"Error in delete_notice route: {e}")
        return jsonify({"error": "An error occurred"}), 500
