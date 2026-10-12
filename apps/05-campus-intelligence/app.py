import logging
import os
import platform
import time
from pathlib import Path
from flask import Flask, jsonify, render_template, request
from werkzeug.middleware.proxy_fix import ProxyFix

from auth.auth_routes import auth_bp
from config import settings
from core.logging_config import configure_logging
from core.request_context import register_request_context
from core.security_headers import apply_security_headers
from core.csrf_protection import register_csrf_protection
from core.tenant_context import register_tenant_context
from database import get_db_connection
from routes.admin_routes import admin_bp
from routes.attendance_routes import attendance_bp
from routes.faculty_dashboard_routes import faculty_dashboard_bp
from routes.faculty_routes import faculty_bp
from routes.goals_routes import goals_bp
from routes.marks_routes import marks_bp
from routes.mock_routes import mock_bp
from routes.prediction_routes import prediction_bp
from routes.notification_routes import notification_bp
from routes.readiness_routes import readiness_bp
from routes.student_routes import student_bp
from routes.student_skill_routes import student_skill_bp
from routes.subject_routes import subject_bp
from routes.peer_learning_routes import peer_learning_bp
from routes.ai_routes import ai_bp
from routes.notice_routes import notice_bp
from routes.company_routes import company_bp
from routes.media_routes import media_bp
from routes.export_routes import export_bp
from routes.placement_routes import placement_bp
from services.attendance_service import ensure_attendance_table_consistency
from services.faculty_dashboard_service import ensure_intervention_table_consistency
from services.goals_service import ensure_goals_tables
from services.marks_service import ensure_marks_table_consistency
from services.migration_service import run_migrations
from services.mock_service import ensure_mock_tests_table_consistency
from services.realtime_notification_service import RealtimeNotificationService
from services.skills_service import ensure_skills_table_consistency
from services.student_service import ensure_student_table_consistency
from services.subject_service import ensure_subject_table_consistency
from services.notice_board_service import NoticeBoardService
from services.ai_conversation_service import ensure_ai_tables_consistency
from services.company_matching_service import ensure_companies_table_consistency
from services.peer_learning_service import ensure_peer_tables_consistency
from services.audit_service import ensure_audit_table
from services.media_service import initialize_media, ensure_media_table
from services.placement_statistics_service import ensure_outcomes_tables

configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = Flask(__name__)
BASE_DIR = Path(__file__).resolve().parent
app.config["SECRET_KEY"] = settings.flask_secret_key
app.config["ENV"] = settings.flask_env
app.config["DEBUG"] = settings.flask_debug
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SECURE"] = settings.auth_cookie_secure
app.config["SESSION_COOKIE_SAMESITE"] = settings.auth_cookie_samesite
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50MB for file uploads

if settings.trust_proxy_count > 0:
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=settings.trust_proxy_count,
        x_proto=settings.trust_proxy_count,
        x_host=settings.trust_proxy_count,
    )

apply_security_headers(app)
register_csrf_protection(app)
register_request_context(app)
register_tenant_context(app)

startup_status = {
    "ready": False,
    "database": "unknown",
    "bootstrap_error": None,
    "bootstrapped_at": None,
    "release_version": settings.release_version,
    "release_commit": settings.release_commit,
}


def bootstrap_with_retry(retries=5, delay=3):
    """
    Attempt to run all bootstrap tasks with retry logic.
    Useful for Render cold starts where Postgres may take a few seconds to accept connections.
    """
    for attempt in range(retries):
        try:
            run_migrations()
            ensure_student_table_consistency()
            ensure_subject_table_consistency()
            ensure_marks_table_consistency()
            ensure_attendance_table_consistency()
            ensure_mock_tests_table_consistency()
            ensure_skills_table_consistency()
            ensure_goals_tables()
            ensure_intervention_table_consistency()
            ensure_ai_tables_consistency()
            ensure_companies_table_consistency()
            ensure_peer_tables_consistency()
            ensure_audit_table()
            ensure_media_table()
            initialize_media()
            ensure_outcomes_tables()
            RealtimeNotificationService.ensure_notifications_table()
            NoticeBoardService.ensure_notices_table()
            return True
        except Exception as e:
            if attempt < retries - 1:
                logger.warning(f"Bootstrap attempt {attempt + 1} failed: {e}. Retrying in {delay}s...")
                time.sleep(delay)
            else:
                logger.exception("Bootstrap failed after all retries")
                raise


try:
    bootstrap_with_retry()
    startup_status["ready"] = True
    startup_status["database"] = "connected"
    startup_status["bootstrapped_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
except Exception as schema_error:
    startup_status["database"] = "disconnected"
    startup_status["bootstrap_error"] = str(schema_error)
    logger.exception("Application bootstrap failed")
    if settings.strict_startup_validation:
        raise

# Blueprint registration
app.register_blueprint(student_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(subject_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(marks_bp)
app.register_blueprint(readiness_bp)
app.register_blueprint(mock_bp)
app.register_blueprint(faculty_bp)
app.register_blueprint(faculty_dashboard_bp)
app.register_blueprint(student_skill_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(prediction_bp)
app.register_blueprint(notification_bp)
app.register_blueprint(goals_bp)
app.register_blueprint(peer_learning_bp)
app.register_blueprint(ai_bp)
app.register_blueprint(notice_bp)
app.register_blueprint(company_bp)
app.register_blueprint(media_bp)
app.register_blueprint(export_bp)
app.register_blueprint(placement_bp)


# --- Global error handlers ---

@app.errorhandler(400)
def bad_request(e):
    if request.path.startswith("/api/") or request.is_json:
        return jsonify({"error": "Bad request", "message": str(e)}), 400
    return render_template("errors/400.html"), 400


@app.errorhandler(401)
def unauthorized(e):
    if request.path.startswith("/api/") or request.is_json:
        return jsonify({"error": "Unauthorized"}), 401
    return render_template("login.html"), 401


@app.errorhandler(403)
def forbidden(e):
    if request.path.startswith("/api/") or request.is_json:
        return jsonify({"error": "Forbidden"}), 403
    return render_template("errors/403.html"), 403


@app.errorhandler(404)
def not_found(e):
    if request.path.startswith("/api/") or request.is_json:
        return jsonify({"error": "Not found"}), 404
    return render_template("errors/404.html"), 404


@app.errorhandler(429)
def too_many_requests(e):
    return jsonify({"error": "Too many requests", "message": "Rate limit exceeded. Please try again shortly."}), 429


@app.errorhandler(500)
def internal_error(e):
    logger.exception("Unhandled server error")
    if request.path.startswith("/api/") or request.is_json:
        return jsonify({"error": "Internal server error"}), 500
    return render_template("errors/500.html"), 500


# --- Health endpoints ---

@app.route("/")
def home():
    return render_template("login.html")


@app.route("/offline")
def offline_page():
    return render_template("offline.html")


@app.route("/health/live")
def live_check():
    return jsonify({
        "status": "alive",
        "app": settings.app_name,
        "environment": settings.flask_env,
        "release_version": settings.release_version,
    }), 200


@app.route("/health/ready")
@app.route("/health")
def health_check():
    status = dict(startup_status)
    try:
        with get_db_connection():
            pass
        status["database"] = "connected"
    except Exception as e:
        status["database"] = "disconnected"
        status["ready"] = False
        status["bootstrap_error"] = status.get("bootstrap_error") or str(e)
    status["status"] = "healthy" if status.get("ready") else "unhealthy"
    status["environment"] = settings.flask_env
    status["service"] = os.getenv("RENDER_SERVICE_NAME") or settings.app_name
    status["runtime"] = {
        "python": platform.python_version(),
        "platform": platform.platform(),
        "web_concurrency": settings.web_concurrency,
        "gunicorn_threads": settings.gunicorn_threads,
    }
    return jsonify(status), 200 if status["status"] == "healthy" else 503


@app.route("/health/startup")
def startup_check():
    status = {
        "status": "ready" if startup_status.get("ready") else "failed",
        "bootstrap_error": startup_status.get("bootstrap_error"),
        "bootstrapped_at": startup_status.get("bootstrapped_at"),
        "release_version": settings.release_version,
        "release_commit": settings.release_commit,
    }
    return jsonify(status), 200 if startup_status.get("ready") else 503


# --- Frontend page routes ---

@app.route("/register")
def register_page():
    return render_template("register.html")


@app.route("/student-dashboard")
def student_dashboard():
    return render_template("dashboard_student.html")


@app.route("/faculty-dashboard")
def faculty_dashboard():
    return render_template("dashboard_faculty.html")


@app.route("/student-progress")
def student_progress():
    return render_template("student_progress.html")


@app.route("/student-skills")
def student_skills():
    return render_template("student_skills.html")


@app.route("/student-profile")
def student_profile():
    return render_template("student_profile.html")


@app.route("/goals")
def goals_page():
    return render_template("goals.html")


@app.route("/notifications")
def notifications_page():
    return render_template("notifications.html")


@app.route("/admin-dashboard")
@app.route("/dashboard")
def admin_dashboard_page():
    return render_template("dashboard_admin.html")


if __name__ == "__main__":
    app.run(debug=settings.flask_debug)
