def test_student_csv_import_validates_required_columns():
    from services.admin_service import import_students_from_csv

    try:
        import_students_from_csv("name,email\nAsha,asha@example.edu\n", institution_id=1)
    except ValueError as exc:
        assert "name, email, department, and roll_number" in str(exc)
    else:
        raise AssertionError("Expected missing CSV columns to be rejected")


def test_student_csv_import_passes_institution_scope(monkeypatch):
    import services.admin_service as admin_service

    captured = {}

    def fake_create_student_record(name, email, department, roll_number, institution_id=None):
        captured["institution_id"] = institution_id
        return {
            "id": 1,
            "name": name,
            "email": email,
            "department": department,
            "roll_number": roll_number,
            "institution_id": institution_id,
        }

    monkeypatch.setattr(admin_service, "create_student_record", fake_create_student_record)

    result = admin_service.import_students_from_csv(
        "name,email,department,roll_number\nAsha,asha@example.edu,CSE,CSE001\n",
        institution_id=55,
    )

    assert result["imported_count"] == 1
    assert result["error_count"] == 0
    assert captured["institution_id"] == 55


def test_report_job_rejects_unsupported_type():
    from services.report_job_service import create_report_job

    try:
        create_report_job("payroll")
    except ValueError as exc:
        assert "Unsupported report type" in str(exc)
    else:
        raise AssertionError("Expected unsupported report type to be rejected")
