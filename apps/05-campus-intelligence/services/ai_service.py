"""
AI Service — wraps Google Gemini for personalised campus intelligence.

Design principles:
- Graceful degradation: returns a helpful fallback string if API key is absent.
- Contextual: injects real student/class data so advice is always personalised.
- Safe: catches all Gemini exceptions and returns a user-friendly error string.
"""
import logging

import google.generativeai as genai

from config import settings

logger = logging.getLogger(__name__)

# System instructions shared across all roles
_SYSTEM_INSTRUCTION = (
    "You are Campus AI, a helpful academic advisor integrated into the Smart Campus "
    "Intelligence System. You provide concise, encouraging, and actionable advice. "
    "Always base your response on the data provided. Format responses with short "
    "paragraphs — no markdown headers, no bullet walls. Keep replies under 200 words "
    "unless the user asks for detail. Speak directly to the user (use 'you'). "
    "Never fabricate statistics not given to you."
)


class AIService:
    _model = None

    @classmethod
    def _get_model(cls):
        """Return cached Gemini model, initialising lazily. Returns None if no key."""
        if cls._model is None:
            if not settings.gemini_api_key:
                return None
            try:
                genai.configure(api_key=settings.gemini_api_key)  # type: ignore
                cls._model = genai.GenerativeModel(  # type: ignore
                    model_name=settings.gemini_model,
                    system_instruction=_SYSTEM_INSTRUCTION,
                )
            except Exception as exc:
                logger.error("Gemini init failed: %s", exc)
                return None
        return cls._model

    # ── Student advisor ───────────────────────────────────────────────────────

    @classmethod
    def get_student_advice(cls, student_id: int, user_message: str, institution_id=None) -> str:
        model = cls._get_model()
        if not model:
            return (
                "The AI assistant needs a Gemini API key to work. "
                "Please ask your administrator to configure it. "
                "In the meantime, check your dashboard for personalised tips!"
            )

        # Import inside method to avoid circular imports
        from services.student_dashboard_service import get_student_dashboard_data
        from services.student_service import get_student_profile
        from services.ai_conversation_service import get_conversation_history, build_context_from_history

        try:
            profile = get_student_profile(student_id, institution_id=institution_id) or {}
            data = get_student_dashboard_data(student_id, institution_id=institution_id)
            history = get_conversation_history(student_id, limit=10)
        except Exception as exc:
            logger.error("Could not fetch student context for AI: %s", exc)
            profile, data, history = {}, {}, []

        # alerts is a list of dicts like {"severity": ..., "title": ..., "message": ...}
        alert_texts = [
            a.get("title", str(a)) if isinstance(a, dict) else str(a)
            for a in data.get("alerts", [])[:3]
        ]
        insight_texts = [
            i if isinstance(i, str) else str(i)
            for i in data.get("insights", [])[:3]
        ]
        
        history_context = build_context_from_history(history)

        context = (
            f"Student name: {profile.get('name', 'Unknown')}\n"
            f"Department: {profile.get('department', 'N/A')}\n"
            f"Readiness score: {data.get('readiness_score', 'N/A')}/100\n"
            f"Overall status: {data.get('status', 'N/A')}\n"
            f"Risk level: {data.get('risk_level', 'N/A')}\n"
            f"Attendance: {data.get('attendance', 'N/A')}%\n"
            f"Average marks: {data.get('marks', 'N/A')}/100\n"
            f"Mock test score: {data.get('mock_score', 'N/A')}/100\n"
            f"Skills count: {data.get('skills_count', 'N/A')}\n"
            f"Placement prediction: {data.get('placement_status', 'N/A')}\n"
            f"System insights: {'; '.join(insight_texts) or 'None'}\n"
            f"Active alerts: {'; '.join(alert_texts) or 'None'}\n"
            f"\n{history_context}\n"
        )

        prompt = f"Student context:\n{context}\n\nStudent asks: {user_message}"

        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as exc:
            error_str = str(exc)
            logger.error("Gemini student chat failed: %s", exc)
            
            # Check for quota exceeded error
            if "quota" in error_str.lower() or "429" in error_str:
                return (
                    "The AI service is temporarily unavailable due to high usage. "
                    "Your data is still visible on your dashboard — please check it directly. "
                    "Try again in a moment."
                )
            
            # Generic error
            return (
                "I'm having trouble connecting right now. "
                "Your data is still visible on your dashboard — please check it directly."
            )

    # ── Faculty advisor ───────────────────────────────────────────────────────

    @classmethod
    def get_faculty_insights(cls, faculty_name: str, class_data: dict, query: str) -> str:
        model = cls._get_model()
        if not model:
            return (
                "The AI assistant needs a Gemini API key to work. "
                "Please ask your administrator to configure it."
            )

        # Safely extract nested keys — class_data may be missing fields
        summary = class_data.get("summary") or {}
        intervention = class_data.get("intervention_summary") or {}

        context = (
            f"Faculty name: {faculty_name}\n"
            f"Total students: {summary.get('total_students', 'N/A')}\n"
            f"Average marks: {summary.get('average_marks', 'N/A')}\n"
            f"Average attendance: {summary.get('average_attendance', 'N/A')}%\n"
            f"At-risk count: {summary.get('at_risk_count', 'N/A')}\n"
            f"Placement ready count: {summary.get('placement_ready_count', 'N/A')}\n"
            f"Open intervention cases: {intervention.get('open_cases', 'N/A')}\n"
        )

        prompt = f"Class summary:\n{context}\n\nFaculty asks: {query}"

        try:
            response = model.generate_content(prompt)
            return response.text
        except Exception as exc:
            error_str = str(exc)
            logger.error("Gemini faculty chat failed: %s", exc)
            
            # Check for quota exceeded error
            if "quota" in error_str.lower() or "429" in error_str:
                return (
                    "The AI service is temporarily unavailable due to high usage. "
                    "Please check your dashboard data directly. Try again in a moment."
                )
            
            # Generic error
            return (
                "I'm having trouble connecting right now. "
                "Please check your dashboard data directly."
            )
