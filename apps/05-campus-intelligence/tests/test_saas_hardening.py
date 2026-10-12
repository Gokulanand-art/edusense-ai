import datetime as dt

import jwt


def _tenant_token(role_id, institution_id=42, *, user_id=9001, is_super_admin=False):
    from auth.auth_middleware import JWT_ALGORITHM, SECRET_KEY

    now = dt.datetime.now(dt.UTC)
    return jwt.encode(
        {
            "jti": f"tenant-test-{role_id}-{user_id}-{institution_id}",
            "user_id": user_id,
            "name": "Tenant User",
            "email": "tenant@example.com",
            "role_id": role_id,
            "institution_id": institution_id,
            "institution_code": "TENANT",
            "institution_name": "Tenant Campus",
            "is_super_admin": is_super_admin,
            "exp": now + dt.timedelta(hours=1),
        },
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def test_student_list_uses_jwt_institution_scope(client, mock_db, monkeypatch):
    import routes.student_routes as student_routes

    captured = {}

    def fake_fetch_all_students(institution_id=None):
        captured["institution_id"] = institution_id
        return []

    monkeypatch.setattr(student_routes, "fetch_all_students", fake_fetch_all_students)

    response = client.get(
        "/students",
        headers={"Authorization": f"Bearer {_tenant_token(1, institution_id=77)}"},
    )

    assert response.status_code == 200
    assert captured["institution_id"] == 77


def test_faculty_dashboard_uses_jwt_institution_scope(client, mock_db, monkeypatch):
    import routes.faculty_dashboard_routes as faculty_routes

    captured = {}

    def fake_get_all_students_dashboard(**kwargs):
        captured.update(kwargs)
        return []

    monkeypatch.setattr(faculty_routes, "get_all_students_dashboard", fake_get_all_students_dashboard)

    response = client.get(
        "/faculty/dashboard",
        headers={"Authorization": f"Bearer {_tenant_token(2, institution_id=88)}"},
    )

    assert response.status_code == 200
    assert captured["institution_id"] == 88


def test_starter_plan_blocks_ai_feature(client, mock_db):
    response = client.post(
        "/ai/chat/student",
        json={"message": "Help me improve"},
        headers={"Authorization": f"Bearer {_tenant_token(3, institution_id=99)}"},
    )

    assert response.status_code == 403
    assert response.get_json()["error"] == "Feature not available for this institution plan"


def test_admin_institutions_requires_super_admin(client, mock_db):
    response = client.get(
        "/admin/institutions",
        headers={"Authorization": f"Bearer {_tenant_token(1, institution_id=42, is_super_admin=False)}"},
    )

    assert response.status_code == 403
    assert response.get_json()["error"] == "Super admin access required"
