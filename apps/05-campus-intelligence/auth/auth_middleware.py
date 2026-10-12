import inspect
from functools import wraps

import jwt
from flask import g, jsonify, request

from auth.current_user import current_user
from config import settings
from database import get_db_connection

SECRET_KEY = settings.jwt_secret
JWT_ALGORITHM = settings.jwt_algorithm

ROLE_MAP = {
    1: "Admin",
    2: "Faculty",
    3: "Student",
}


def _build_current_user(payload):
    role_name = ROLE_MAP.get(payload.get("role_id"), "Unknown")
    return {
        **payload,
        "id": payload.get("user_id"),
        "user_id": payload.get("user_id"),
        "name": payload.get("name", ""),
        "role": role_name,
        "role_name": role_name,
        "institution_id": payload.get("institution_id"),
        "institution_code": payload.get("institution_code"),
        "institution_name": payload.get("institution_name"),
        "is_super_admin": bool(payload.get("is_super_admin")),
    }


def _get_request_token():
    auth_header = request.headers.get("Authorization", "")
    parts = auth_header.split(" ", 1)
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1].strip()
        if token:
            return token
    cookie_token = request.cookies.get(settings.auth_cookie_name, "")
    return cookie_token.strip() or None


def token_required(f):
    signature = inspect.signature(f)
    expects_current_user = "current_user" in signature.parameters

    @wraps(f)
    def decorated(*args, **kwargs):
        token = _get_request_token()

        if not token:
            return jsonify({"error": "Token is missing"}), 401

        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])

            jti = payload.get("jti")
            if jti:
                with get_db_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT 1 FROM jwt_blacklist WHERE jti = %s", (jti,))
                        if cur.fetchone():
                            return jsonify({"error": "Token has been revoked"}), 401

            user = _build_current_user(payload)
            request.environ["user"] = user
            g.user = user
            g.user_id = user.get("user_id")
            g.user_role = user.get("role")
            g.user_name = user.get("name", "")  # FIX: was missing, caused AttributeError in ai_routes
            g.institution_id = user.get("institution_id") or getattr(g, "institution_id", None)
            g.institution_code = user.get("institution_code") or getattr(g, "institution_code", None)
            if user.get("institution_name"):
                g.institution_name = user.get("institution_name")

        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401

        if expects_current_user and "current_user" not in kwargs:
            kwargs["current_user"] = user

        return f(*args, **kwargs)

    return decorated


def role_required(*required_roles):
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "Unauthorized"}), 401

            user_role = user.get("role_name") or ROLE_MAP.get(user.get("role_id"))

            if user_role not in required_roles:
                return jsonify({"error": f"Access denied. Required roles: {', '.join(required_roles)}"}), 403

            return f(*args, **kwargs)

        return decorated

    return decorator
