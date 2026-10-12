from services.mock_service import get_mock_trend
from services.marks_service import get_subject_wise_marks, get_marks_timeline, get_subject_wise_trend
from services.prediction_service import predict_placement_from_score
from services.readiness_service import calculate_readiness, get_top_students
from services.goals_service import get_goal_summary, get_student_goals
from services.realtime_notification_service import RealtimeNotificationService
from services.student_service import get_student_profile


def _get_status_and_risk(final_score):
    if final_score >= 80:
        return "Excellent", "Safe"
    if final_score >= 60:
        return "Moderate", "Warning"
    return "At Risk", "Critical"


def _build_alerts(attendance, marks, mock_score):
    alerts = []

    if attendance < 75:
        alerts.append({
            "severity": "warning",
            "title": "Attendance Warning",
            "message": "Attendance is below 75%. Lower classroom engagement can reduce placement readiness.",
        })

    if marks < 60:
        alerts.append({
            "severity": "danger",
            "title": "Marks Need Attention",
            "message": "Average marks are below 60. Focus on core subjects to improve academic consistency.",
        })

    if mock_score < 60:
        alerts.append({
            "severity": "warning",
            "title": "Practice Suggestion",
            "message": "Mock score is below 60. Regular practice tests can improve placement performance.",
        })

    return alerts


def _build_smart_insights(attendance, marks, mock_score, skills_score, subject_performance):
    insights = []

    if attendance < 75:
        insights.append(
            "Your attendance is below 75%, and continued absenteeism may reduce placement chances and internal performance."
        )

    if marks < 60:
        insights.append(
            "Your academic average is below 60, so strengthening your weakest subjects should be the top priority this term."
        )

    if mock_score < 60:
        insights.append(
            "Mock performance is currently low, which can affect placement readiness unless aptitude practice becomes more regular."
        )

    if skills_score >= 50 and marks < 60:
        insights.append(
            "Your skill profile is improving, but balancing it with stronger academic marks will make your overall profile more competitive."
        )

    if subject_performance:
        strongest_subject = max(subject_performance, key=lambda item: float(item.get("average_marks") or 0))
        weakest_subject = min(subject_performance, key=lambda item: float(item.get("average_marks") or 0))

        if float(strongest_subject.get("average_marks") or 0) > 0:
            insights.append(
                f"Your strongest subject right now is {strongest_subject.get('subject_name')}, which is a good area to keep building confidence."
            )

        if float(weakest_subject.get("average_marks") or 0) < 60:
            insights.append(
                f"{weakest_subject.get('subject_name')} needs more attention because its average is pulling down your overall academic readiness."
            )

    if not insights:
        insights.append(
            "You are maintaining a balanced performance across academics, attendance, mock tests, and skills."
        )

    return insights[:5]


def _build_performance_breakdown(attendance, marks, mock_score, skills_score):
    metrics = {
        "Attendance": attendance,
        "Marks": marks,
        "Mock Tests": mock_score,
        "Skills": skills_score,
    }

    return {
        "strength": max(metrics.items(), key=lambda x: x[1])[0],
        "weakness": min(metrics.items(), key=lambda x: x[1])[0],
    }


def _build_profile_summary(profile, readiness_score, status, subject_performance):
    strongest_subject = None
    weakest_subject = None

    if subject_performance:
        strongest_subject = max(subject_performance, key=lambda item: float(item.get("average_marks") or 0))
        weakest_subject = min(subject_performance, key=lambda item: float(item.get("average_marks") or 0))

    return {
        "name": profile.get("name") if profile else "--",
        "email": profile.get("email") if profile else "--",
        "roll_number": profile.get("roll_number") if profile else "--",
        "department": profile.get("department") if profile else "--",
        "readiness_score": readiness_score,
        "status": status,
        "best_subject": strongest_subject.get("subject_name") if strongest_subject else None,
        "weakest_subject": weakest_subject.get("subject_name") if weakest_subject else None,
    }


def _build_due_goal_summary(goals):
    due_goals = []
    for goal in goals:
        target_date = goal.get("target_date")
        if not target_date or goal.get("status") != "active":
            continue
        due_goals.append(goal)

    due_goals.sort(key=lambda item: item.get("target_date") or "9999-12-31")
    return due_goals[:3]


def _build_action_plan(attendance, marks, mock_score, skills_score, subject_performance, goal_summary, unread_count):
    actions = []

    if attendance < 75:
        actions.append({
            "priority": "high",
            "title": "Recover attendance this week",
            "message": "Plan to improve attendance in your next classes and prevent the score from slipping further.",
        })

    if marks < 60:
        weakest_subject = min(subject_performance, key=lambda item: float(item.get("average_marks") or 0)) if subject_performance else None
        actions.append({
            "priority": "high",
            "title": "Focus on your weakest academic area",
            "message": (
                f"Spend extra study time on {weakest_subject.get('subject_name')} this week."
                if weakest_subject else
                "Spend extra study time on the subject where your marks are currently lowest."
            ),
        })

    if mock_score < 60:
        actions.append({
            "priority": "medium",
            "title": "Schedule one mock practice session",
            "message": "Regular practice tests will improve speed, confidence, and readiness for placement rounds.",
        })

    if skills_score < 50:
        actions.append({
            "priority": "medium",
            "title": "Add one skill-building task",
            "message": "Choose one practical skill milestone this week to improve the balance of your profile.",
        })

    if goal_summary.get("active", 0) == 0:
        actions.append({
            "priority": "medium",
            "title": "Create a short-term goal",
            "message": "A small measurable goal can make your weekly progress easier to sustain.",
        })

    if unread_count:
        actions.append({
            "priority": "low",
            "title": "Review unread notifications",
            "message": f"You have {unread_count} unread notifications that may include reminders or action items.",
        })

    if not actions:
        actions.append({
            "priority": "low",
            "title": "Maintain your current momentum",
            "message": "Your indicators look stable right now. Keep your current study, attendance, and practice routine consistent.",
        })

    return actions[:4]


def _build_weekly_summary(profile, readiness_score, status, alerts, goal_summary, due_goals, unread_count, action_plan):
    completion_rate = goal_summary.get("completion_rate", 0)
    return {
        "headline": f"{status} week ahead for {profile.get('name') if profile else 'you'}",
        "readiness_score": readiness_score,
        "active_alerts": len(alerts),
        "active_goals": goal_summary.get("active", 0),
        "goal_completion_rate": completion_rate,
        "due_goal_count": len(due_goals),
        "unread_notifications": unread_count,
        "primary_focus": action_plan[0]["title"] if action_plan else "Keep progressing steadily",
    }


def _build_placement_score_breakdown(attendance, marks, mock_score, skills_score):
    """
    Build a detailed breakdown of placement score contribution.
    Shows how each metric contributes to the final placement readiness score.
    Weights: Attendance=30%, Marks=40%, Skills=20%, Mock=10%
    """
    total = 100
    components = []
    
    # Calculate weighted contributions
    attendance_contribution = (attendance * 0.30) / 100  # Convert from percentage
    marks_contribution = (marks * 0.40) / 100
    skills_contribution = (skills_score * 0.20) / 100
    mock_contribution = (mock_score * 0.10) / 100
    
    final_weighted = (attendance_contribution + marks_contribution + 
                        skills_contribution + mock_contribution)
    
    if final_weighted > 0:
        # Normalize to percentages
        attendance_percent = (attendance_contribution / final_weighted) * 100 if final_weighted > 0 else 0
        marks_percent = (marks_contribution / final_weighted) * 100 if final_weighted > 0 else 0
        skills_percent = (skills_contribution / final_weighted) * 100 if final_weighted > 0 else 0
        mock_percent = (mock_contribution / final_weighted) * 100 if final_weighted > 0 else 0
    else:
        attendance_percent = marks_percent = skills_percent = mock_percent = 0

    components = [
        {
            "metric": "Attendance",
            "value": round(attendance, 2),
            "weight": 30,
            "contribution": round(attendance_percent, 2),
            "status": "Good" if attendance >= 75 else "At Risk",
        },
        {
            "metric": "Marks",
            "value": round(marks, 2),
            "weight": 40,
            "contribution": round(marks_percent, 2),
            "status": "Good" if marks >= 60 else "At Risk",
        },
        {
            "metric": "Mock Tests",
            "value": round(mock_score, 2),
            "weight": 10,
            "contribution": round(mock_percent, 2),
            "status": "Good" if mock_score >= 60 else "At Risk",
        },
        {
            "metric": "Skills",
            "value": round(skills_score, 2),
            "weight": 20,
            "contribution": round(skills_percent, 2),
            "status": "Good" if skills_score >= 50 else "At Risk",
        },
    ]

    return {
        "components": components,
        "total_weight": 100,
        "calculation_formula": "Final Score = (Attendance × 0.30) + (Marks × 0.40) + (Skills × 0.20) + (Mock × 0.10)",
    }


def get_student_dashboard_data(student_id, institution_id=None):
    profile = get_student_profile(student_id, institution_id=institution_id)
    if institution_id is not None and not profile:
        raise ValueError("Student not found")

    readiness = calculate_readiness(student_id, institution_id=institution_id)
    subject_performance = get_subject_wise_marks(student_id, institution_id=institution_id)
    goal_summary = get_goal_summary(student_id)
    goals = get_student_goals(student_id)

    attendance = float(readiness["attendance"])
    marks = float(readiness["marks"])
    mock_score = float(readiness["mock_score"])
    skills_score = float(readiness["skills_score"])
    skills_count = int(readiness.get("skills_count", round(skills_score / 10)))
    final_score = float(readiness["final_score"])

    status, risk_level = _get_status_and_risk(final_score)
    trend = get_mock_trend(student_id)
    alerts = _build_alerts(attendance, marks, mock_score)
    insights = _build_smart_insights(attendance, marks, mock_score, skills_score, subject_performance)
    breakdown = _build_performance_breakdown(attendance, marks, mock_score, skills_score)
    placement_breakdown = _build_placement_score_breakdown(attendance, marks, mock_score, skills_score)
    user_id = profile.get("user_id") if profile else None
    notification_preferences = RealtimeNotificationService.get_user_preferences(user_id) if user_id else {"digest_enabled": True}
    unread_count = RealtimeNotificationService.get_unread_count(user_id) if user_id else 0
    due_goals = _build_due_goal_summary(goals)
    action_plan = _build_action_plan(
        attendance,
        marks,
        mock_score,
        skills_score,
        subject_performance,
        goal_summary,
        unread_count,
    )
    prediction = predict_placement_from_score(
        student_id,
        final_score,
        metrics={
            "attendance": attendance,
            "marks": marks,
            "mock_score": mock_score,
            "skills_score": skills_score,
        },
    )
    
    # Get growth tracking data
    marks_timeline = get_marks_timeline(student_id, limit=8, institution_id=institution_id)
    subject_trends = get_subject_wise_trend(student_id, institution_id=institution_id)
    weekly_summary = _build_weekly_summary(
        profile,
        round(final_score, 2),
        status,
        alerts,
        goal_summary,
        due_goals,
        unread_count,
        action_plan,
    )

    return {
        "attendance": round(attendance, 2),
        "marks": round(marks, 2),
        "mock_score": round(mock_score, 2),
        "skills_score": round(skills_score, 2),
        "skills_count": skills_count,
        "readiness_score": round(final_score, 2),
        "status": status,
        "risk_level": risk_level,
        "trend": trend,
        "alerts": alerts,
        "insights": insights,
        "strength": breakdown["strength"],
        "weakness": breakdown["weakness"],
        "performance_breakdown": breakdown,
        "placement_breakdown": placement_breakdown,
        "placement_status": prediction["placement_status"],
        "placement_reasons": prediction["reasons"],
        "profile": profile,
        "profile_summary": _build_profile_summary(profile, round(final_score, 2), status, subject_performance),
        "goal_summary": goal_summary,
        "due_goals": due_goals,
        "action_plan": action_plan,
        "weekly_summary": weekly_summary,
        "notification_summary": {
            "unread_count": unread_count,
            "digest_enabled": notification_preferences.get("digest_enabled", True),
            "digest_frequency": notification_preferences.get("digest_frequency", "weekly"),
        },
        "subject_performance": subject_performance,
        "marks_timeline": marks_timeline,
        "subject_trends": subject_trends,
        "top_students": get_top_students(institution_id=institution_id),
    }
