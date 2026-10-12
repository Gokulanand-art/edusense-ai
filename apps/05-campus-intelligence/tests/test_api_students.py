def _auth_header(token):
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_fetch_students(client, mock_db, monkeypatch, valid_admin_token):
    import routes.student_routes as student_routes

    expected_students = [
        {
            "id": 1,
            "name": "Asha Rao",
            "email": "asha@example.com",
            "roll_number": "CSE001",
            "department": "CSE",
        }
    ]
    monkeypatch.setattr(student_routes, "fetch_all_students", lambda: expected_students)

    response = client.get("/students", headers=_auth_header(valid_admin_token))

    assert response.status_code == 200
    body = response.get_json()
    assert body["status"] == "success"
    assert body["data"] == expected_students
    assert body["pagination"]["total"] == 1
    assert body["pagination"]["page"] == 1


def test_student_dashboard_returns_current_student_data(client, mock_db, monkeypatch, valid_student_token):
    import routes.student_routes as student_routes

    monkeypatch.setattr(
        student_routes,
        "get_student_record_by_user_id",
        lambda user_id: {
            "id": 7,
            "user_id": user_id,
            "name": "Test Student",
            "email": "student@example.com",
            "roll_number": "CSE007",
            "department": "CSE",
        },
    )
    monkeypatch.setattr(
        student_routes,
        "get_student_dashboard_data",
        lambda student_id: {
            "student_id": student_id,
            "readiness_score": 82.5,
            "status": "Excellent",
        },
    )

    response = client.get("/student/dashboard", headers=_auth_header(valid_student_token))

    assert response.status_code == 200
    assert response.get_json()["readiness_score"] == 82.5


def test_student_dashboard_returns_404_when_student_record_missing(
    client,
    mock_db,
    monkeypatch,
    valid_student_token,
):
    import routes.student_routes as student_routes

    monkeypatch.setattr(student_routes, "get_student_record_by_user_id", lambda user_id: None)

    response = client.get("/student/dashboard", headers=_auth_header(valid_student_token))

    assert response.status_code == 404
    assert response.get_json()["error"] == "Student not found"


def test_add_student_validation_error_returns_400(client, mock_db, valid_admin_token):
    response = client.post(
        "/add-student",
        headers=_auth_header(valid_admin_token),
        json={"name": "Asha Rao"},
    )

    assert response.status_code == 400


def test_add_student_duplicate_returns_409(client, mock_db, monkeypatch, valid_admin_token):
    import routes.student_routes as student_routes
    from services.student_service import DuplicateStudentError

    def raise_duplicate(*args, **kwargs):
        raise DuplicateStudentError("Email already exists")

    monkeypatch.setattr(student_routes, "create_student_record", raise_duplicate)

    response = client.post(
        "/add-student",
        headers=_auth_header(valid_admin_token),
        json={
            "name": "Asha Rao",
            "email": "asha@example.com",
            "department": "CSE",
            "roll_number": "CSE001",
        },
    )

    assert response.status_code == 409
    assert response.get_json()["error"] == "Email already exists"


def test_update_student_missing_record_returns_404(client, mock_db, monkeypatch, valid_admin_token):
    import routes.student_routes as student_routes
    from services.student_service import StudentNotFoundError

    def raise_not_found(*args, **kwargs):
        raise StudentNotFoundError("Student not found")

    monkeypatch.setattr(student_routes, "update_student_record", raise_not_found)

    response = client.put(
        "/update-student/999",
        headers=_auth_header(valid_admin_token),
        json={
            "name": "Asha Rao",
            "email": "asha@example.com",
            "department": "CSE",
            "roll_number": "CSE001",
        },
    )

    assert response.status_code == 404
    assert response.get_json()["error"] == "Student not found"


def test_delete_student_missing_record_returns_404(client, mock_db, monkeypatch, valid_admin_token):
    import routes.student_routes as student_routes
    from services.student_service import StudentNotFoundError

    def raise_not_found(*args, **kwargs):
        raise StudentNotFoundError("Student not found")

    monkeypatch.setattr(student_routes, "delete_student_record", raise_not_found)

    response = client.delete("/delete-student/999", headers=_auth_header(valid_admin_token))

    assert response.status_code == 404
    assert response.get_json()["error"] == "Student not found"
