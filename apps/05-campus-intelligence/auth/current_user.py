from typing import Any

from flask import g

UserContext = dict[str, Any]


def current_user() -> UserContext:
    user = getattr(g, "user", None)
    return user if isinstance(user, dict) else {}


def current_user_id():
    return current_user().get("user_id")


def current_institution_id():
    return current_user().get("institution_id") or getattr(g, "institution_id", None)


def current_is_super_admin():
    return bool(current_user().get("is_super_admin"))
