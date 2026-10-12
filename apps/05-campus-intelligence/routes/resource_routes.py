import logging
from flask import Blueprint, jsonify, request
from auth.auth_middleware import token_required, role_required
from services.resources_service import ResourcesService
from utils.validators import RequestValidator

logger = logging.getLogger(__name__)

resource_bp = Blueprint("resource_bp", __name__)

@resource_bp.route("/api/resources", methods=["POST"])
@token_required
@role_required("Admin", "Faculty")
def create_resource(current_user):
    try:
        data = request.get_json() or {}
        v = RequestValidator(data)
        v.required("title", "resource_link")
        if v.has_errors():
            return jsonify({"error": v.first_error()}), 400
            
        title = v.validated_data["title"]
        description = data.get("description", "")
        resource_link = v.validated_data["resource_link"]
        subject_id = data.get("subject_id")
        
        resource_id = ResourcesService.add_resource(
            title=title,
            description=description,
            resource_link=resource_link,
            subject_id=subject_id,
            uploaded_by=current_user["id"]
        )
        
        if not resource_id:
            return jsonify({"error": "Failed to upload resource"}), 500
            
        return jsonify({"message": "Resource shared successfully 📚", "id": resource_id}), 201
    except Exception as e:
        logger.error(f"Error in create_resource route: {e}")
        return jsonify({"error": "An error occurred"}), 500

@resource_bp.route("/api/resources", methods=["GET"])
@token_required
def get_resources(current_user):
    try:
        subject_id = request.args.get("subject_id", type=int)
        resources = ResourcesService.get_resources(subject_id=subject_id)
        return jsonify({"data": resources}), 200
    except Exception as e:
        logger.error(f"Error in get_resources route: {e}")
        return jsonify({"error": "An error occurred"}), 500

@resource_bp.route("/api/resources/<int:resource_id>", methods=["DELETE"])
@token_required
@role_required("Admin", "Faculty")
def delete_resource(current_user, resource_id):
    try:
        success = ResourcesService.delete_resource(resource_id)
        if success:
            return jsonify({"message": "Resource deleted successfully"}), 200
        return jsonify({"error": "Failed to delete resource"}), 500
    except Exception as e:
        logger.error(f"Error in delete_resource route: {e}")
        return jsonify({"error": "An error occurred"}), 500
