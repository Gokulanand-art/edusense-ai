import jwt

from auth.auth_middleware import JWT_ALGORITHM


def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_valid_token_passes_through(client, mock_db, valid_student_token):
    response = client.get("/_test/auth/student", headers=_auth_header(valid_student_token))

    assert response.status_code == 200
    assert response.get_json() == {"ok": True}


def test_expired_token_returns_401(client, mock_db, token_factory):
    token = token_factory(3, expires_in_seconds=-1)

    response = client.get("/_test/auth/student", headers=_auth_header(token))

    assert response.status_code == 401


def test_token_signed_with_wrong_secret_returns_401(client, mock_db, token_factory):
    token = token_factory(3, secret="wrong-secret")

    response = client.get("/_test/auth/student", headers=_auth_header(token))

    assert response.status_code == 401


def test_missing_authorization_header_and_cookie_returns_401(client, mock_db):
    response = client.get("/_test/auth/student")

    assert response.status_code == 401


def test_student_token_on_faculty_only_route_returns_403(client, mock_db, valid_student_token):
    response = client.get("/_test/auth/faculty", headers=_auth_header(valid_student_token))

    assert response.status_code == 403


def test_faculty_token_on_admin_only_route_returns_403(client, mock_db, valid_faculty_token):
    response = client.get("/_test/auth/admin", headers=_auth_header(valid_faculty_token))

    assert response.status_code == 403


def test_cookie_token_is_supported(client, mock_db, valid_student_token):
    from config import settings

    client.set_cookie(settings.auth_cookie_name, valid_student_token)
    response = client.get("/_test/auth/student")

    assert response.status_code == 200


def test_malformed_token_returns_401(client, mock_db):
    token = jwt.encode({"role_id": 3}, "wrong-secret", algorithm=JWT_ALGORITHM)

    response = client.get("/_test/auth/student", headers=_auth_header(token))

    assert response.status_code == 401
