"""
Goal Tracking Routes - Phase 3 Feature

RESTful endpoints for student goals, milestones, badges and summaries.
"""
from flask import Blueprint, request, jsonify
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_institution_id, current_is_super_admin, current_user_id
from services.goals_service import (
    create_goal, get_student_goals, update_goal_progress,
    update_goal, delete_goal, get_milestones, add_milestone,
    toggle_milestone, get_student_badges, get_goal_summary,
)
from services.student_service import get_student_profile, get_student_record_by_user_id
from utils.response import success_response, error_response
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

goals_bp = Blueprint("goals", __name__, url_prefix="/api/goals")


def _student_id():
    user_id = current_user_id()
    student = get_student_record_by_user_id(user_id, institution_id=current_institution_id())
    if not student:
        return None
    return student["id"]


# ── Goals CRUD ────────────────────────────────────────────────────────────────

@goals_bp.route("/", methods=["GET"])
@token_required
@role_required("Student")
def list_goals():
    """GET /api/goals/?status=active&page=1&per_page=20  – list goals, optionally filtered with pagination."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    
    # Get pagination parameters
    params, errors = PaginationHelper.get_pagination_params()
    if errors:
        error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
        return jsonify(error_resp), status_code
    
    # Get all goals filtered by status if provided
    status = request.args.get("status")
    all_goals = get_student_goals(sid, status)
    
    # Apply pagination
    page = params['page']
    per_page = params['per_page']
    total = len(all_goals)
    offset = (page - 1) * per_page
    goals = all_goals[offset:offset + per_page]
    
    response = PaginationHelper.paginate(goals, total, page, per_page)
    return jsonify(response), 200


@goals_bp.route("/", methods=["POST"])
@token_required
@role_required("Student")
def create():
    """POST /api/goals/  – create a new goal."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    data = request.get_json() or {}
    result = create_goal(sid, data)
    if "error" in result:
        return error_response(result["error"], 400)
    return success_response(result, "Goal created", 201)


@goals_bp.route("/<int:goal_id>", methods=["PUT"])
@token_required
@role_required("Student")
def update(goal_id):
    """PUT /api/goals/<id>  – update goal metadata."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    data = request.get_json() or {}
    result = update_goal(goal_id, sid, data)
    if "error" in result:
        return error_response(result["error"], 404)
    return success_response(None, result["message"])


@goals_bp.route("/<int:goal_id>/progress", methods=["PATCH"])
@token_required
@role_required("Student")
def update_progress(goal_id):
    """PATCH /api/goals/<id>/progress  – update current_value."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    data = request.get_json() or {}
    current_value = data.get("current_value")
    if current_value is None:
        return error_response("current_value is required", 400)
    try:
        current_value = float(current_value)
    except ValueError:
        return error_response("current_value must be a number", 400)
    result = update_goal_progress(goal_id, sid, current_value)
    if "error" in result:
        return error_response(result["error"], 404)
    return success_response(None, result["message"])


@goals_bp.route("/<int:goal_id>", methods=["DELETE"])
@token_required
@role_required("Student")
def delete(goal_id):
    """DELETE /api/goals/<id>  – delete a goal."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    result = delete_goal(goal_id, sid)
    if "error" in result:
        return error_response(result["error"], 404)
    return success_response(None, result["message"])


# ── Summary & Badges ──────────────────────────────────────────────────────────

@goals_bp.route("/summary", methods=["GET"])
@token_required
@role_required("Student")
def summary():
    """GET /api/goals/summary  – stats + badges for the current user."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    data = get_goal_summary(sid)
    return success_response(data)


@goals_bp.route("/badges", methods=["GET"])
@token_required
@role_required("Student")
def badges():
    """GET /api/goals/badges  – list badges earned by the current user."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    return success_response(get_student_badges(sid))


# ── Milestones ────────────────────────────────────────────────────────────────

@goals_bp.route("/<int:goal_id>/milestones", methods=["GET"])
@token_required
@role_required("Student")
def list_milestones(goal_id):
    """GET /api/goals/<id>/milestones"""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    return success_response(get_milestones(goal_id, sid))


@goals_bp.route("/<int:goal_id>/milestones", methods=["POST"])
@token_required
@role_required("Student")
def add_ms(goal_id):
    """POST /api/goals/<id>/milestones  – add a milestone."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    if not title:
        return error_response("Milestone title is required", 400)
    result = add_milestone(goal_id, sid, title)
    if "error" in result:
        return error_response(result["error"], 404)
    return success_response(result, "Milestone added", 201)


@goals_bp.route("/milestones/<int:milestone_id>/toggle", methods=["PATCH"])
@token_required
@role_required("Student")
def toggle_ms(milestone_id):
    """PATCH /api/goals/milestones/<id>/toggle  – check/uncheck a milestone."""
    sid = _student_id()
    if sid is None:
        return error_response("Student not found", 404)
    result = toggle_milestone(milestone_id, sid)
    if "error" in result:
        return error_response(result["error"], 404)
    return success_response(result)


# ── Admin/Faculty view ────────────────────────────────────────────────────────

@goals_bp.route("/student/<int:student_id>/summary", methods=["GET"])
@token_required
@role_required("Admin")
def student_summary(student_id):
    """GET /api/goals/student/<id>/summary  – admin view of a student's goals."""
    institution_id = None if current_is_super_admin() else current_institution_id()
    if not get_student_profile(student_id, institution_id=institution_id):
        return error_response("Student not found", 404)

    data = get_goal_summary(student_id)
    return success_response(data)
