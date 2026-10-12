import logging
from flask import Blueprint, jsonify, request, g
from auth.auth_middleware import token_required, role_required
from core.feature_flags import require_feature
from services.ai_service import AIService
from services.student_service import get_student_record_by_user_id
from services.ai_conversation_service import (
    store_conversation,
    check_rate_limit,
    increment_rate_limit,
    get_quick_prompts,
)

ai_bp = Blueprint("ai", __name__)
logger = logging.getLogger(__name__)

_MAX_LEN = 1000


@ai_bp.route("/ai/chat/student", methods=["POST"])
@token_required
def student_chat():
    """Chat endpoint for students with rate limiting and conversation history."""
    feature_error = require_feature("ai_assistant")
    if feature_error:
        return feature_error

    data = request.get_json() or {}
    message = str(data.get("message") or "").strip()
    if not message:
        return jsonify({"error": "Message is required"}), 400
    if len(message) > _MAX_LEN:
        return jsonify({"error": f"Message too long (max {_MAX_LEN} chars)"}), 400

    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
    
    student_id = student["id"]
    
    # Check rate limit
    limit_check = check_rate_limit(student_id)
    if not limit_check["allowed"]:
        return jsonify({
            "error": limit_check["message"],
            "remaining": limit_check["remaining"],
            "reset_at": limit_check["reset_at"],
        }), 429

    try:
        # Store user message in history
        store_conversation(student_id, "student", message)
        
        # Get AI response
        response = AIService.get_student_advice(student_id, message, institution_id=g.institution_id)
        
        # Store assistant message in history
        store_conversation(student_id, "assistant", response)
        
        # Increment rate limit counter
        increment_rate_limit(student_id)
        
        return jsonify({
            "response": response,
            "remaining": max(0, limit_check["remaining"] - 1),
            "reset_at": limit_check["reset_at"],
        }), 200
    except Exception as e:
        logger.exception("student_chat failed")
        return jsonify({"error": "AI service unavailable. Please try again later."}), 503


@ai_bp.route("/ai/quick-prompts", methods=["GET"])
@token_required
def quick_prompts():
    """Get suggested quick prompts for student."""
    feature_error = require_feature("ai_assistant")
    if feature_error:
        return feature_error

    student = get_student_record_by_user_id(g.user_id, institution_id=g.institution_id)
    if not student:
        return jsonify({"error": "Student profile not found"}), 404
    
    try:
        prompts = get_quick_prompts(student["id"], institution_id=g.institution_id)
        return jsonify({"prompts": prompts}), 200
    except Exception as e:
        logger.exception("quick_prompts failed")
        return jsonify({"error": "Could not fetch prompts"}), 500


@ai_bp.route("/ai/chat/faculty", methods=["POST"])
@token_required
@role_required("Faculty", "Admin")
def faculty_chat():
    """Chat endpoint for faculty insights."""
    feature_error = require_feature("ai_assistant")
    if feature_error:
        return feature_error

    data = request.get_json() or {}
    query = str(data.get("query") or "").strip()
    if not query:
        return jsonify({"error": "Query is required"}), 400
    if len(query) > _MAX_LEN:
        return jsonify({"error": f"Query too long (max {_MAX_LEN} chars)"}), 400

    try:
        from services.faculty_dashboard_service import get_faculty_dashboard_summary
        # Call with no filters so AI always gets full class picture
        summary = get_faculty_dashboard_summary(institution_id=g.institution_id)
        faculty_name = getattr(g, "user_name", None) or "Faculty"
        response = AIService.get_faculty_insights(faculty_name, summary, query)
        return jsonify({"response": response}), 200
    except Exception as e:
        logger.exception("faculty_chat failed")
        return jsonify({"error": "AI service unavailable. Please try again later."}), 503


@ai_bp.route("/ai/faculty/student-summary/<int:student_id>", methods=["GET"])
@token_required
@role_required("Faculty", "Admin")
def faculty_student_summary(student_id):
    """Get AI-generated summary for a specific student (faculty view)."""
    feature_error = require_feature("ai_assistant")
    if feature_error:
        return feature_error

    try:
        from services.student_dashboard_service import get_student_dashboard_data
        from services.student_service import get_student_profile
        
        profile = get_student_profile(student_id, institution_id=g.institution_id) or {}
        data = get_student_dashboard_data(student_id, institution_id=g.institution_id)
        
        if not profile or not data:
            return jsonify({"error": "Student not found"}), 404
        
        # Build student-focused summary for faculty
        context = (
            f"Student name: {profile.get('name', 'Unknown')}\n"
            f"Department: {profile.get('department', 'N/A')}\n"
            f"Readiness score: {data.get('readiness_score', 'N/A')}/100\n"
            f"Overall status: {data.get('status', 'N/A')}\n"
            f"Risk level: {data.get('risk_level', 'N/A')}\n"
            f"Attendance: {data.get('attendance', 'N/A')}%\n"
            f"Average marks: {data.get('marks', 'N/A')}/100\n"
            f"Mock test score: {data.get('mock_score', 'N/A')}/100\n"
            f"Skills: {data.get('skills_count', 'N/A')}\n"
            f"Placement status: {data.get('placement_status', 'N/A')}\n"
        )
        
        prompt = f"Generate a 3-bullet faculty briefing for this student:\n\n{context}\n\nFormat: Current status, trajectory, recommended intervention."
        
        response = AIService._get_model()
        if not response:
            return jsonify({
                "summary": "AI summary requires Gemini API key configuration.",
                "status_for_faculty": data.get("status", "N/A"),
                "key_action": "Check student dashboard for detailed metrics."
            }), 200
        
        ai_summary = response.generate_content(prompt).text
        
        return jsonify({
            "student_id": student_id,
            "student_name": profile.get("name", "Unknown"),
            "ai_summary": ai_summary,
            "readiness_score": data.get("readiness_score", 0),
            "risk_level": data.get("risk_level", "N/A"),
        }), 200
    except Exception as e:
        logger.exception(f"faculty_student_summary failed for student {student_id}")
        return jsonify({"error": "Could not generate summary"}), 500
