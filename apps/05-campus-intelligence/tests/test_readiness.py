import pytest

from services import readiness_service


def test_all_zero_inputs_return_needs_improvement(mock_db):
    mock_db.set_readiness_row(
        attendance=0,
        marks=0,
        skills_count=0,
        skills_score=0,
        mock_score=0,
        final_score=0,
    )

    result = readiness_service.calculate_readiness(1)

    assert result["final_score"] == 0
    assert result["status"] == "Needs Improvement"


def test_all_maximum_inputs_return_placement_ready(mock_db):
    mock_db.set_readiness_row(
        attendance=100,
        marks=100,
        skills_count=10,
        skills_score=100,
        mock_score=100,
        final_score=100,
    )

    result = readiness_service.calculate_readiness(1)

    assert result["final_score"] == 100
    assert result["status"] == "Placement Ready"


@pytest.mark.parametrize(
    ("score", "expected_status"),
    [
        (80.0, "Placement Ready"),
        (79.9, "Moderate"),
        (60.0, "Moderate"),
        (59.9, "Needs Improvement"),
    ],
)
def test_status_boundaries(score, expected_status):
    assert readiness_service._status_from_score(score) == expected_status


def test_missing_attendance_data_falls_back_to_zero(mock_db):
    mock_db.set_readiness_row(
        attendance=None,
        marks=100,
        skills_count=10,
        skills_score=100,
        mock_score=100,
        final_score=70,
    )

    result = readiness_service.calculate_readiness(1)

    assert result["attendance"] == 0
    assert result["final_score"] == 70
    assert result["status"] == "Moderate"


def test_negative_input_values_are_clamped_to_zero(mock_db):
    mock_db.set_readiness_row(
        attendance=-90,
        marks=-80,
        skills_count=-2,
        skills_score=-70,
        mock_score=-60,
        final_score=-75,
    )

    result = readiness_service.calculate_readiness(1)

    assert result["attendance"] == 0
    assert result["marks"] == 0
    assert result["skills_score"] == 0
    assert result["mock_score"] == 0
    assert result["skills_count"] == 0
    assert result["final_score"] == 0
    assert result["status"] == "Needs Improvement"


def test_readiness_weights_sum_to_one():
    assert sum(readiness_service.READINESS_WEIGHTS.values()) == pytest.approx(1.0)


def test_invalid_weight_sum_is_rejected():
    with pytest.raises(ValueError, match="sum to 1.0"):
        readiness_service.calculate_weighted_score(
            attendance=100,
            marks=100,
            skills_score=100,
            mock_score=100,
            weights={
                "attendance": 0.30,
                "marks": 0.40,
                "skills": 0.20,
                "mock_tests": 0.20,
            },
        )
