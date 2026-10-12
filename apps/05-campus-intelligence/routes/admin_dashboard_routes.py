import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, jsonify, request
from services.admin_dashboard_service import get_admin_dashboard
from services.readiness_service import get_all_scored_students
from auth.auth_middleware import token_required, role_required

admin_dashboard_bp = Blueprint("admin_dashboard_bp", __name__)


@admin_dashboard_bp.route("/admin/dashboard", methods=["GET"])
@token_required
@role_required("Admin")
def admin_dashboard():
    """
    Get admin dashboard with analytics
    Optional params: search, department, sort
    """
    try:
        data = get_admin_dashboard()
        return jsonify(data), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_dashboard_bp.route("/admin/students", methods=["GET"])
@token_required
@role_required("Admin")
def admin_students_list():
    """
    Get paginated list of all students with search and filter.
    Query params: search (name/email), department, sort (asc/desc)
    """
    try:
        search = request.args.get("search")
        department = request.args.get("department")
        sort_order = request.args.get("sort", "desc")

        students = get_all_scored_students(
            search=search,
            department=department,
            sort_order=sort_order,
        )

        return jsonify({
            "count": len(students),
            "students": students,
        }), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500
