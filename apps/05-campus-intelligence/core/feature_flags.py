from flask import g, jsonify

from services.institution_service import get_plan_features


def current_institution_features():
    institution = getattr(g, "institution", None) or {}
    return get_plan_features(institution.get("plan_name"))


def feature_enabled(feature_name: str) -> bool:
    return bool(current_institution_features().get(feature_name))


def require_feature(feature_name: str):
    if feature_enabled(feature_name):
        return None

    return jsonify({"error": "Feature not available for this institution plan"}), 403
