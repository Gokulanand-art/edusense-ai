def _build_placement_reasons(metrics, placement_status):
    if not metrics:
        if placement_status == "Likely Placed":
            return ["Overall readiness score is strong."]
        if placement_status == "Needs Improvement":
            return ["Overall readiness is moderate and needs more consistency."]
        return ["Overall readiness is currently at risk."]

    attendance = float(metrics.get("attendance", 0))
    marks = float(metrics.get("marks", 0))
    mock_score = float(metrics.get("mock_score", 0))
    skills_score = float(metrics.get("skills_score", 0))

    positive = []
    neutral = []
    caution = []

    if attendance >= 75:
        positive.append("Good attendance")
    elif attendance >= 60:
        neutral.append("Attendance is fairly consistent")
    else:
        caution.append("Attendance needs improvement")

    if skills_score >= 70:
        positive.append("Strong skills")
    elif skills_score >= 40:
        neutral.append("Skills are developing steadily")
    else:
        caution.append("Skills need more development")

    if marks >= 75:
        positive.append("Strong marks")
    elif marks >= 60:
        neutral.append("Moderate marks")
    else:
        caution.append("Marks need improvement")

    if mock_score >= 70:
        positive.append("Good mock performance")
    elif mock_score >= 60:
        neutral.append("Mock scores are moderate")
    else:
        caution.append("Mock practice needs improvement")

    if placement_status == "Likely Placed":
        reasons = positive + neutral + caution
    elif placement_status == "Needs Improvement":
        reasons = caution[:2] + positive[:1] + neutral
    else:
        reasons = caution + positive[:1] + neutral[:1]

    return reasons[:3] or ["Overall readiness needs more consistency."]


def predict_placement_from_score(student_id, final_score, metrics=None):
    if final_score >= 80:
        placement = "Likely Placed"
    elif final_score >= 60:
        placement = "Needs Improvement"
    else:
        placement = "At Risk"

    return {
        "student_id": student_id,
        "final_score": round(final_score, 2),
        "placement_status": placement,
        "reasons": _build_placement_reasons(metrics, placement),
    }
