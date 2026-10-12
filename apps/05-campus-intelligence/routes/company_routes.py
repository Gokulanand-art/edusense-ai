"""
Company Matching Routes — HTTP endpoints for company matching feature.

Student can see:
- Which companies they can join NOW
- Which they're close to (8 points away from Infosys)
- Stretch targets (what they'd need to aim for)

This is the most emotionally resonant endpoint in the system.
"""
import logging
from flask import Blueprint, jsonify, request, g

from auth.auth_middleware import token_required, role_required
from core.feature_flags import require_feature
from services.company_matching_service import (
    ensure_companies_table_consistency,
    seed_default_companies,
    get_company_matches_for_student,
    get_all_companies,
)
from services.student_service import get_student_record_by_user_id
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

company_bp = Blueprint("company", __name__)
logger = logging.getLogger(__name__)


@company_bp.route("/student/company-matches", methods=["GET"])
@token_required
def student_company_matches():
    """
    Get all company matches for the authenticated student.
    
    Response groups companies into:
    - eligible_now: Ready to apply now (90%+ match)
    - eligible_with_improvement: Close (75-89% match, shows gap)
    - stretch_targets: Aspirational (0-74% match)
    """
    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
    
    try:
        matches = get_company_matches_for_student(student["id"], institution_id=g.institution_id)
        
        return jsonify({
            "student_name": student.get("name", "Unknown"),
            "eligible_now": matches.get("eligible_now", []),
            "eligible_with_improvement": matches.get("eligible_with_improvement", []),
            "stretch_targets": matches.get("stretch_targets", []),
            "summary": {
                "ready_to_apply": len(matches.get("eligible_now", [])),
                "close_to_ready": len(matches.get("eligible_with_improvement", [])),
                "aspirational": len(matches.get("stretch_targets", [])),
            }
        }), 200
    except Exception as e:
        logger.exception(f"student_company_matches failed: {e}")
        return jsonify({"error": "Could not fetch company matches"}), 500


@company_bp.route("/admin/companies/seed", methods=["POST"])
@token_required
@role_required("Admin")
def seed_companies():
    """
    Admin endpoint to seed default companies (TCS, Infosys, etc.).
    Idempotent — safe to call multiple times.
    """
    try:
        seed_default_companies()
        companies = get_all_companies()
        
        return jsonify({
            "message": "Default companies seeded successfully",
            "count": len(companies),
            "companies": companies[:5]  # Show first 5
        }), 201
    except Exception as e:
        logger.exception("seed_companies failed")
        return jsonify({"error": f"Failed to seed companies: {str(e)}"}), 500


@company_bp.route("/admin/companies", methods=["GET"])
@token_required
@role_required("Admin")
def admin_list_companies():
    """Admin: list all companies for management with pagination."""
    try:
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        all_companies = get_all_companies()
        
        # Apply pagination
        page = params['page']
        per_page = params['per_page']
        total = len(all_companies) if all_companies else 0
        offset = (page - 1) * per_page
        companies = all_companies[offset:offset + per_page] if all_companies else []
        
        response = PaginationHelper.paginate(companies, total, page, per_page)
        response["meta"]["total"] = total
        return jsonify(response), 200
    except Exception as e:
        logger.exception("admin_list_companies failed")
        error_resp, status_code = create_error_response("SERVER_ERROR", "Could not fetch companies", 500)
        return jsonify(error_resp), status_code


@company_bp.route("/admin/companies", methods=["POST"])
@token_required
@role_required("Admin")
def admin_add_company():
    """Admin: add a new placement company."""
    data = request.get_json() or {}
    
    required = ["name", "min_marks_percentage", "min_attendance", "min_mock_score", "package_lpa"]
    if not all(data.get(k) for k in required):
        return jsonify({"error": f"Missing required fields: {required}"}), 400
    
    try:
        from database import get_db_connection
        
        with get_db_connection() as conn:
            ensure_companies_table_consistency(conn)
            
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO placement_companies 
                    (name, min_marks_percentage, min_attendance, min_mock_score, package_lpa, sector, required_skills)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (
                        data.get("name"),
                        data.get("min_marks_percentage"),
                        data.get("min_attendance"),
                        data.get("min_mock_score"),
                        data.get("package_lpa"),
                        data.get("sector"),
                        data.get("required_skills", []),
                    ),
                )
                company_id = cur.fetchone()[0]
        
        return jsonify({
            "message": "Company added successfully",
            "company_id": company_id
        }), 201
    except Exception as e:
        logger.exception("admin_add_company failed")
        return jsonify({"error": f"Failed to add company: {str(e)}"}), 500


@company_bp.route("/student/company-matches/insights", methods=["GET"])
@token_required
def student_company_insights():
    """
    Get AI-powered insights about company matches.
    Optional query param: company_name (e.g., "Infosys")
    """
    from services.ai_service import AIService

    feature_error = require_feature("ai_assistant")
    if feature_error:
        return feature_error
    
    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
    
    try:
        matches = get_company_matches_for_student(student["id"], institution_id=g.institution_id)
        company_name = request.args.get("company_name", "").strip()
        
        # Build context for Gemini
        context = f"""
Student company matching analysis:

Companies ready to apply to: {len(matches['eligible_now'])}
{[c['name'] for c in matches['eligible_now'][:3]]}

Companies close to ready: {len(matches['eligible_with_improvement'])}
Closest option: {matches['eligible_with_improvement'][0]['name'] if matches['eligible_with_improvement'] else 'N/A'}
Gap: {matches['eligible_with_improvement'][0].get('gap', '') if matches['eligible_with_improvement'] else ''}

Aspiration companies: {len(matches['stretch_targets'])}
"""
        
        if company_name:
            context += f"\nStudent asked specifically about: {company_name}"
        
        prompt = f"{context}\n\nProvide 2-3 actionable insights for this student about their placement readiness."
        
        model = AIService._get_model()
        if not model:
            return jsonify({
                "insights": "AI insights require Gemini API key. Check your dashboard for company matches instead."
            }), 200
        
        response = model.generate_content(prompt)
        
        return jsonify({
            "insights": response.text,
            "eligible_now": len(matches.get("eligible_now", [])),
            "eligible_with_improvement": len(matches.get("eligible_with_improvement", [])),
        }), 200
    except Exception as e:
        logger.exception("student_company_insights failed")
        return jsonify({"error": "Could not generate insights"}), 500
