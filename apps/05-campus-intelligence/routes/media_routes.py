"""
Media Upload Routes
Handles file uploads, downloads, and management
"""

import logging
from io import BytesIO

from flask import Blueprint, request, jsonify, g, send_file
from auth.auth_middleware import token_required
from services.media_service import (
    save_file, get_file_by_id, list_user_files, delete_file,
    make_file_public, ensure_media_table, MAX_FILE_SIZE
)

media_bp = Blueprint("media", __name__)
logger = logging.getLogger(__name__)

@media_bp.before_request
def init():
    """Initialize media tables."""
    try:
        ensure_media_table()
    except Exception as e:
        logger.warning(f"Media table initialization: {str(e)}")

@media_bp.route("/media/upload", methods=["POST"])
@token_required
def upload_file():
    """Upload a file."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    description = request.form.get('description', '')
    
    result = save_file(
        file,
        user_id=g.user_id,
        user_type=g.user_role.lower(),
        description=description,
        institution_id=getattr(g, "institution_id", None),
    )
    
    if result.get('success'):
        return jsonify(result), 201
    else:
        return jsonify(result), 400

@media_bp.route("/media/list", methods=["GET"])
@token_required
def list_files():
    """List user's files."""
    try:
        limit = min(int(request.args.get('limit', 50)), 100)
        offset = int(request.args.get('offset', 0))
        
        files = list_user_files(
            user_id=g.user_id,
            user_type=g.user_role.lower(),
            limit=limit,
            offset=offset,
            institution_id=getattr(g, "institution_id", None),
        )
        
        return jsonify({
            "success": True,
            "files": files,
            "count": len(files),
            "limit": limit,
            "offset": offset
        }), 200
    
    except Exception as e:
        logger.error(f"List files failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@media_bp.route("/media/<file_id>", methods=["GET"])
@token_required
def download_file(file_id):
    """Download a file."""
    try:
        file_info = get_file_by_id(
            file_id,
            user_id=g.user_id,
            user_type=g.user_role.lower(),
            institution_id=getattr(g, "institution_id", None),
            is_super_admin=bool(getattr(g, "user", {}).get("is_super_admin")),
            include_data=True,
        )
        
        if not file_info or file_info.get("file_data") is None:
            return jsonify({"error": "File not found or access denied"}), 404

        return send_file(
            BytesIO(file_info["file_data"]),
            as_attachment=True,
            download_name=file_info.get('original_filename'),
            mimetype=file_info.get('mime_type')
        )
    
    except Exception as e:
        logger.error(f"File download failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@media_bp.route("/media/<file_id>", methods=["DELETE"])
@token_required
def remove_file(file_id):
    """Delete a file."""
    result = delete_file(
        file_id,
        user_id=g.user_id,
        user_type=g.user_role.lower(),
        institution_id=getattr(g, "institution_id", None),
    )
    
    if result.get('success'):
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@media_bp.route("/media/<file_id>/public", methods=["PUT"])
@token_required
def toggle_file_public(file_id):
    """Toggle file public/private status."""
    data = request.get_json() or {}
    is_public = data.get('is_public', False)
    
    result = make_file_public(
        file_id,
        user_id=g.user_id,
        user_type=g.user_role.lower(),
        is_public=is_public,
        institution_id=getattr(g, "institution_id", None),
    )
    
    if result.get('success'):
        return jsonify(result), 200
    else:
        return jsonify(result), 400

@media_bp.errorhandler(413)
def handle_large_file(e):
    """Handle file too large error."""
    return jsonify({
        "error": f"File too large. Maximum size: {MAX_FILE_SIZE / 1024 / 1024}MB"
    }), 413
