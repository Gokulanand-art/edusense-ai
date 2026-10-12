"""
Placement Routes
=================
Endpoints for placement outcome tracking and placement statistics dashboard.

Data flows:
  POST  /placement/outcomes           — Admin records a student offer
  PATCH /placement/outcomes/<id>      — Admin updates offer status
  GET   /placement/outcomes/student/<id> — Admin or student views own offers
  POST  /placement/drives             — Admin records a campus drive
  GET   /placement/stats              — Admin placement statistics dashboard (full)
  GET   /placement/stats/summary      — Admin KPI cards (lightweight)
  GET   /placement/dashboard          — Admin placement dashboard HTML page
"""

import logging
from flask import Blueprint, jsonify, request, render_template, g
from auth.auth_middleware import token_required, role_required
from services.placement_statistics_service import (
    ensure_outcomes_tables,
    record_placement_outcome,
    record_placement_drive,
    update_outcome_status,
    get_student_outcomes,
    get_full_placement_stats,
    get_placement_summary,
)
from services.student_service import get_student_record_by_user_id
from services.audit_service import record_audit_event

logger = logging.getLogger(__name__)
placement_bp = Blueprint("placement_bp", __name__)


# ── HTML page ─────────────────────────────────────────────────────────────────

@placement_bp.route("/placement/dashboard")
@token_required
@role_required("Admin")
def placement_dashboard_page():
    """Render the admin placement analytics dashboard."""
    return render_template("placement_dashboard.html")


# ── Stats endpoints ───────────────────────────────────────────────────────────

@placement_bp.route("/placement/stats")
@token_required
@role_required("Admin")
def get_placement_stats():
    """Full placement statistics payload for the dashboard."""
    try:
        ensure_outcomes_tables()
        institution_id = g.institution_id
        stats = get_full_placement_stats(institution_id)
        return jsonify({"success": True, "data": stats})
    except Exception as exc:
        logger.exception("Failed to load placement stats")
        return jsonify({"success": False, "error": str(exc)}), 500


@placement_bp.route("/placement/stats/summary")
@token_required
@role_required("Admin")
def get_placement_stats_summary():
    """Lightweight KPI summary for the admin main dashboard widget."""
    try:
        ensure_outcomes_tables()
        summary = get_placement_summary(g.institution_id)
        return jsonify({"success": True, "data": summary})
    except Exception as exc:
        logger.exception("Failed to load placement summary")
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Outcome CRUD ──────────────────────────────────────────────────────────────

@placement_bp.route("/placement/outcomes", methods=["POST"])
@token_required
@role_required("Admin")
def create_outcome():
    """Record a new placement outcome (admin only)."""
    data = request.get_json(silent=True) or {}

    required = ["student_id", "company_name", "package_lpa"]
    missing = [f for f in required if not data.get(f)]
    if missing:
        return jsonify({"success": False, "error": f"Missing fields: {', '.join(missing)}"}), 400

    try:
        package = float(data["package_lpa"])
        if package <= 0 or package > 200:
            raise ValueError("Package must be between 0 and 200 LPA")
    except (ValueError, TypeError) as e:
        return jsonify({"success": False, "error": str(e)}), 400

    try:
        result = record_placement_outcome(
            student_id=int(data["student_id"]),
            company_name=data["company_name"].strip(),
            package_lpa=package,
            institution_id=g.institution_id,
            recorded_by=g.user["id"],
            role_title=data.get("role_title"),
            offer_type=data.get("offer_type", "full_time"),
            status=data.get("status", "offered"),
            offer_date=data.get("offer_date"),
            joining_date=data.get("joining_date"),
            company_id=data.get("company_id"),
            drive_id=data.get("drive_id"),
            notes=data.get("notes"),
        )
        record_audit_event(
            action="placement_outcome_recorded",
            actor_user_id=g.user["id"],
            target_resource=f"student:{data['student_id']}",
            details={
                "company": data["company_name"],
                "package_lpa": package,
                "status": data.get("status", "offered"),
            },
            institution_id=g.institution_id,
        )
        return jsonify({"success": True, "data": result}), 201
    except Exception as exc:
        logger.exception("Failed to record placement outcome")
        return jsonify({"success": False, "error": str(exc)}), 500


@placement_bp.route("/placement/outcomes/<int:outcome_id>", methods=["PATCH"])
@token_required
@role_required("Admin")
def update_outcome(outcome_id):
    """Update status of an existing outcome."""
    data = request.get_json(silent=True) or {}
    status = data.get("status")
    if not status:
        return jsonify({"success": False, "error": "status is required"}), 400

    try:
        updated = update_outcome_status(outcome_id, status, g.institution_id)
        if not updated:
            return jsonify({"success": False, "error": "Outcome not found"}), 404
        return jsonify({"success": True, "message": f"Status updated to {status}"})
    except ValueError as e:
        return jsonify({"success": False, "error": str(e)}), 400
    except Exception as exc:
        logger.exception("Failed to update outcome")
        return jsonify({"success": False, "error": str(exc)}), 500


@placement_bp.route("/placement/outcomes/student/<int:student_id>")
@token_required
def get_student_placement_outcomes(student_id):
    """
    Get outcomes for a student.
    Admin: any student in their institution.
    Student: only their own outcomes.
    """
    role = (g.user_role or "").lower()

    if role == "student":
        # Verify the calling user owns this student record
        own = get_student_record_by_user_id(g.user["id"], institution_id=g.institution_id)
        if not own or own.get("id") != student_id:
            return jsonify({"success": False, "error": "Forbidden"}), 403

    try:
        outcomes = get_student_outcomes(student_id, g.institution_id)
        return jsonify({"success": True, "data": outcomes})
    except Exception as exc:
        logger.exception("Failed to fetch student outcomes")
        return jsonify({"success": False, "error": str(exc)}), 500


# ── Drives ────────────────────────────────────────────────────────────────────

@placement_bp.route("/placement/drives", methods=["POST"])
@token_required
@role_required("Admin")
def create_drive():
    """Record a campus placement drive."""
    data = request.get_json(silent=True) or {}

    if not data.get("company_name") or not data.get("drive_date"):
        return jsonify({"success": False, "error": "company_name and drive_date are required"}), 400

    try:
        result = record_placement_drive(
            company_name=data["company_name"].strip(),
            drive_date=data["drive_date"],
            institution_id=g.institution_id,
            conducted_by=g.user["id"],
            company_id=data.get("company_id"),
            drive_type=data.get("drive_type", "on_campus"),
            departments=data.get("departments", []),
            min_cgpa=data.get("min_cgpa"),
            roles_offered=data.get("roles_offered", []),
            packages_offered=data.get("packages_offered"),
            notes=data.get("notes"),
        )
        return jsonify({"success": True, "data": result}), 201
    except Exception as exc:
        logger.exception("Failed to record placement drive")
        return jsonify({"success": False, "error": str(exc)}), 500
