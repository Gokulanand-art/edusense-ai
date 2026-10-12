from services.prediction_service import predict_placement_from_score


def test_prediction_marks_high_score_as_likely_placed():
    result = predict_placement_from_score(
        student_id=1,
        final_score=83.456,
        metrics={
            "attendance": 90,
            "marks": 86,
            "skills_score": 80,
            "mock_score": 75,
        },
    )

    assert result["student_id"] == 1
    assert result["final_score"] == 83.46
    assert result["placement_status"] == "Likely Placed"
    assert result["reasons"]


def test_prediction_marks_boundary_score_as_needs_improvement():
    result = predict_placement_from_score(student_id=1, final_score=60)

    assert result["placement_status"] == "Needs Improvement"
    assert result["reasons"] == ["Overall readiness is moderate and needs more consistency."]


def test_prediction_marks_low_score_as_at_risk():
    result = predict_placement_from_score(
        student_id=1,
        final_score=42,
        metrics={
            "attendance": 50,
            "marks": 45,
            "skills_score": 20,
            "mock_score": 35,
        },
    )

    assert result["placement_status"] == "At Risk"
    assert "Attendance needs improvement" in result["reasons"]


def test_prediction_caps_reasons_to_three_items():
    result = predict_placement_from_score(
        student_id=1,
        final_score=81,
        metrics={
            "attendance": 88,
            "marks": 91,
            "skills_score": 95,
            "mock_score": 89,
        },
    )

    assert len(result["reasons"]) == 3
