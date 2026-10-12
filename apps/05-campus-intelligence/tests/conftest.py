import datetime as dt
import os
import sys
from pathlib import Path

import jwt
import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

os.environ.setdefault("JWT_SECRET", "test-jwt-secret")
os.environ.setdefault("SECRET_KEY", "test-flask-secret")
os.environ.setdefault("STRICT_STARTUP_VALIDATION", "false")
os.environ.setdefault("FLASK_ENV", "testing")
os.environ.setdefault("FLASK_DEBUG", "false")


class FakeCursor:
    def __init__(self, db):
        self.db = db
        self.rows = []
        self.rowcount = 0
        self.closed = False

    def execute(self, query, params=None):
        self.db.queries.append((query, params))
        compact_query = " ".join(query.split())

        if "FROM jwt_blacklist" in compact_query:
            jti = params[0] if params else None
            self.rows = [(1,)] if jti in self.db.blacklisted_jtis else []
            return

        if "FROM student_scores" in compact_query:
            student_id = params[0] if params else None
            if student_id in self.db.readiness_rows:
                self.rows = [self.db.readiness_rows[student_id]]
            else:
                self.rows = list(self.db.readiness_rows.values())
            return

        self.rows = []

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def fetchall(self):
        return list(self.rows)

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        self.close()
        return False


class FakeConnection:
    def __init__(self, db):
        self.db = db
        self.closed = False
        self.commits = 0
        self.rollbacks = 0

    def cursor(self):
        return FakeCursor(self.db)

    def commit(self):
        self.commits += 1

    def rollback(self):
        self.rollbacks += 1

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        if exc_type:
            self.rollback()
        else:
            self.commit()
        self.close()
        return False


class MockDb:
    def __init__(self):
        self.readiness_rows = {}
        self.blacklisted_jtis = set()
        self.queries = []

    def connect(self):
        return FakeConnection(self)

    def set_readiness_row(
        self,
        *,
        student_id=1,
        attendance=0,
        marks=0,
        skills_count=0,
        skills_score=0,
        mock_score=0,
        final_score=0,
    ):
        self.readiness_rows[student_id] = (
            student_id,
            "Test Student",
            "student@example.com",
            "CSE001",
            "CSE",
            attendance,
            marks,
            skills_count,
            skills_score,
            mock_score,
            final_score,
        )


def _disable_startup_db_bootstrap():
    import services.attendance_service as attendance_service
    import services.faculty_dashboard_service as faculty_dashboard_service
    import services.goals_service as goals_service
    import services.marks_service as marks_service
    import services.migration_service as migration_service
    import services.mock_service as mock_service
    import services.notice_board_service as notice_board_service
    import services.realtime_notification_service as realtime_notification_service
    import services.resources_service as resources_service
    import services.skills_service as skills_service
    import services.student_service as student_service
    import services.subject_service as subject_service
    import services.theme_service as theme_service
    import services.audit_service as audit_service

    no_op = lambda *args, **kwargs: None
    attendance_service.ensure_attendance_table_consistency = no_op
    faculty_dashboard_service.ensure_intervention_table_consistency = no_op
    goals_service.ensure_goals_tables = no_op
    marks_service.ensure_marks_table_consistency = no_op
    migration_service.run_migrations = no_op
    mock_service.ensure_mock_tests_table_consistency = no_op
    skills_service.ensure_skills_table_consistency = no_op
    student_service.ensure_student_table_consistency = no_op
    subject_service.ensure_subject_table_consistency = no_op
    realtime_notification_service.RealtimeNotificationService.ensure_notifications_table = no_op
    theme_service.ThemeService.ensure_theme_table = no_op
    notice_board_service.NoticeBoardService.ensure_notices_table = no_op
    resources_service.ResourcesService.ensure_resources_table = no_op
    audit_service.ensure_audit_table = no_op


def _register_test_auth_routes(flask_app):
    if "_test_student_only" in flask_app.view_functions:
        return

    from auth.auth_middleware import role_required, token_required
    from flask import jsonify

    @flask_app.get("/_test/auth/student", endpoint="_test_student_only")
    @token_required
    @role_required("Student")
    def student_only():
        return jsonify({"ok": True}), 200

    @flask_app.get("/_test/auth/faculty", endpoint="_test_faculty_only")
    @token_required
    @role_required("Faculty")
    def faculty_only():
        return jsonify({"ok": True}), 200

    @flask_app.get("/_test/auth/admin", endpoint="_test_admin_only")
    @token_required
    @role_required("Admin")
    def admin_only():
        return jsonify({"ok": True}), 200


@pytest.fixture(scope="session")
def app():
    _disable_startup_db_bootstrap()
    from app import app as flask_app

    flask_app.config.update(TESTING=True)
    _register_test_auth_routes(flask_app)
    return flask_app


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def mock_db(monkeypatch):
    import auth.auth_middleware as auth_middleware
    import database
    import services.readiness_service as readiness_service

    db = MockDb()
    monkeypatch.setattr(database, "get_db_connection", db.connect)
    monkeypatch.setattr(auth_middleware, "get_db_connection", db.connect)
    monkeypatch.setattr(readiness_service, "get_db_connection", db.connect)
    return db


def _build_token(role_id, *, user_id=1, secret=None, expires_in_seconds=3600):
    from auth.auth_middleware import JWT_ALGORITHM, SECRET_KEY

    now = dt.datetime.now(dt.UTC)
    return jwt.encode(
        {
            "jti": f"test-jti-{role_id}-{user_id}-{expires_in_seconds}",
            "user_id": user_id,
            "name": "Test User",
            "email": "user@example.com",
            "role_id": role_id,
            "exp": now + dt.timedelta(seconds=expires_in_seconds),
        },
        secret or SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


@pytest.fixture()
def valid_student_token():
    return _build_token(3, user_id=101)


@pytest.fixture()
def valid_faculty_token():
    return _build_token(2, user_id=202)


@pytest.fixture()
def valid_admin_token():
    return _build_token(1, user_id=303)


@pytest.fixture()
def token_factory():
    return _build_token
