import bcrypt
import hmac
import jwt
import datetime
import logging
import uuid

from flask import Blueprint, jsonify, request, g

from auth.current_user import current_user
from auth.auth_middleware import SECRET_KEY, JWT_ALGORITHM, token_required
from config import settings
from core.rate_limiter import rate_limit
from database import get_db_connection
from services.institution_service import get_default_institution, get_institution_by_code
from services.student_service import ensure_student_table_consistency, get_all_departments, sync_student_record
from services.email_service import create_and_store_otp, send_otp_email, verify_and_use_otp
from utils.validators import sanitize_string, validate_email, validate_password, validate_roll_number

auth_bp = Blueprint("auth_bp", __name__)
logger = logging.getLogger(__name__)

JWT_EXP_HOURS = settings.jwt_exp_hours

# Dummy hash used when user is not found — prevents timing-based user enumeration
_DUMMY_HASH = bcrypt.hashpw(b"dummy-prevent-timing-attack", bcrypt.gensalt()).decode("utf-8")


def _get_dashboard_path(role_name):
    role_to_path = {
        "student": "/student-dashboard",
        "faculty": "/faculty-dashboard",
        "admin": "/admin-dashboard",
    }
    return role_to_path.get((role_name or "").lower(), "/")


def _set_auth_cookie(response, token):
    response.set_cookie(
        settings.auth_cookie_name,
        token,
        max_age=JWT_EXP_HOURS * 60 * 60,
        httponly=True,
        secure=settings.auth_cookie_secure,
        samesite=settings.auth_cookie_samesite,
        domain=settings.auth_cookie_domain,
        path="/",
    )
    return response


def _clear_auth_cookie(response):
    response.delete_cookie(
        settings.auth_cookie_name,
        domain=settings.auth_cookie_domain,
        path="/",
    )
    return response


def _get_roles():
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id, role_name FROM roles ORDER BY id ASC")
            rows = cur.fetchall()
    return [
        {"id": row[0], "name": row[1], "dashboard_path": _get_dashboard_path(row[1])}
        for row in rows
    ]


def _resolve_request_institution(connection=None):
    institution = getattr(g, "institution", None)
    if institution:
        return institution

    request_payload = request.get_json(silent=True) or {}
    institution_code = request_payload.get("institution_code")
    if institution_code:
        return get_institution_by_code(institution_code, connection=connection)

    return get_default_institution(connection=connection)


@auth_bp.route("/auth/roles", methods=["GET"])
def get_roles():
    try:
        return jsonify(_get_roles()), 200
    except Exception as e:
        logger.exception("get_roles failed")
        return jsonify({"error": "Failed to fetch roles"}), 500


@auth_bp.route("/auth/departments", methods=["GET"])
def get_departments():
    try:
        institution_id = getattr(g, "institution_id", None)
        return jsonify(get_all_departments(institution_id=institution_id)), 200
    except Exception as e:
        logger.exception("get_departments failed")
        return jsonify({"error": "Failed to fetch departments"}), 500


@auth_bp.route("/register", methods=["POST"])
@auth_bp.route("/auth/register", methods=["POST"])
@rate_limit(max_requests=5, window_seconds=300)
def register():
    try:
        data = request.get_json() or {}

        name = sanitize_string(data.get("name"), max_length=100)
        email = validate_email(data.get("email"))
        password = validate_password(data.get("password"))
        department = sanitize_string(data.get("department"), max_length=100, allow_empty=True)
        roll_number = sanitize_string(data.get("roll_number"), max_length=50, allow_empty=True)

        try:
            role_id = int(data.get("role_id") or 0)
        except (TypeError, ValueError):
            return jsonify({"error": "Invalid role selected"}), 400

        if not role_id:
            return jsonify({"error": "Missing fields"}), 400

        if role_id == 3 and not department:
            return jsonify({"error": "Department is required for student registration"}), 400

        if role_id == 3 and not roll_number:
            return jsonify({"error": "Roll number is required for student registration"}), 400

        if role_id == 3:
            roll_number = validate_roll_number(roll_number)

        ensure_student_table_consistency()

        with get_db_connection() as conn:
            institution = _resolve_request_institution(connection=conn)
            if institution is None:
                return jsonify({"error": "Unable to resolve institution"}), 400

            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 1
                    FROM users
                    WHERE institution_id = %s AND LOWER(email) = LOWER(%s)
                    """,
                    (institution["id"], email),
                )
                if cur.fetchone():
                    return jsonify({"error": "Email already registered"}), 400

                hashed_password = bcrypt.hashpw(
                    password.encode("utf-8"), bcrypt.gensalt()
                ).decode("utf-8")

                cur.execute(
                    """
                    INSERT INTO users (name, email, password, role_id, institution_id)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (name, email, hashed_password, role_id, institution["id"]),
                )
                result = cur.fetchone()
                if result is None:
                    return jsonify({"error": "Failed to create user"}), 500

                user_id = result[0]
                student_record = None

                if role_id == 3:
                    student_record = sync_student_record(
                        user_id, name, email, department,
                        roll_number=roll_number, connection=conn,
                        institution_id=institution["id"],
                    )

        return jsonify({
            "message": "User registered successfully",
            "user": {
                "id": user_id,
                "name": name,
                "email": email,
                "role_id": role_id,
                "institution_id": institution["id"],
                "institution_code": institution["code"],
                "roll_number": student_record["roll_number"] if student_record else None,
                "department": department or None,
            },
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("User registration failed")
        return jsonify({"error": "Registration failed. Please try again."}), 500


@auth_bp.route("/auth/login", methods=["POST"])
@rate_limit(max_requests=10, window_seconds=60)
def login():
    try:
        data = request.get_json() or {}

        email = validate_email(data.get("email"))
        password = str(data.get("password") or "")

        if not email or not password:
            return jsonify({"error": "Email and password are required"}), 400

        # Cap password length to prevent DoS via bcrypt with very long inputs
        if len(password) > 128:
            # Still run dummy check to avoid timing leak
            bcrypt.checkpw(b"x", _DUMMY_HASH.encode("utf-8"))
            return jsonify({"error": "Invalid credentials"}), 401

        with get_db_connection() as conn:
            institution = _resolve_request_institution(connection=conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        u.id,
                        u.name,
                        u.email,
                        u.password,
                        u.role_id,
                        r.role_name,
                        u.institution_id,
                        COALESCE(i.code, 'DEFAULT') AS institution_code,
                        COALESCE(i.name, 'Default Campus') AS institution_name,
                        COALESCE(u.is_super_admin, FALSE) AS is_super_admin
                    FROM users u
                    LEFT JOIN roles r ON u.role_id = r.id
                    LEFT JOIN institutions i ON u.institution_id = i.id
                    WHERE LOWER(u.email) = LOWER(%s)
                      AND (%s IS NULL OR u.institution_id = %s OR COALESCE(u.is_super_admin, FALSE) = TRUE)
                    """,
                    (email, institution["id"] if institution else None, institution["id"] if institution else None),
                )
                user = cur.fetchone()

        # Always run bcrypt to prevent timing-based user enumeration
        stored_hash = user[3] if user else _DUMMY_HASH
        password_matches = bcrypt.checkpw(
            password.encode("utf-8"), stored_hash.encode("utf-8")
        )

        if not user or not password_matches:
            return jsonify({"error": "Invalid credentials"}), 401

        token = jwt.encode(
            {
                "jti": str(uuid.uuid4()),
                "user_id": user[0],
                "name": user[1],
                "email": user[2],
                "role_id": user[4],
                "institution_id": user[6],
                "institution_code": user[7],
                "institution_name": user[8],
                "is_super_admin": user[9],
                "exp": datetime.datetime.now(datetime.UTC)
                + datetime.timedelta(hours=JWT_EXP_HOURS),
            },
            SECRET_KEY,
            algorithm=JWT_ALGORITHM,
        )

        role_name = user[5] or ""
        dashboard_path = _get_dashboard_path(role_name)

        response = jsonify({
            "message": "Login successful",
            "token": token,
            "user": {
                "id": user[0],
                "name": user[1],
                "email": user[2],
                "role_id": user[4],
                "role_name": role_name,
                "dashboard_path": dashboard_path,
                "institution_id": user[6],
                "institution_code": user[7],
                "institution_name": user[8],
                "is_super_admin": user[9],
            },
        })
        _set_auth_cookie(response, token)
        return response, 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.exception("Login failed")
        return jsonify({"error": "Login failed. Please try again."}), 500


@auth_bp.route("/auth/logout", methods=["POST"])
@token_required
def logout():
    jti = current_user().get("jti")
    if jti:
        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "INSERT INTO jwt_blacklist (jti) VALUES (%s) ON CONFLICT (jti) DO NOTHING",
                        (jti,),
                    )
        except Exception as e:
            logger.error(f"Failed to blacklist token: {e}")

    response = jsonify({"message": "Logout successful"})
    _clear_auth_cookie(response)
    return response, 200


@auth_bp.route("/auth/forgot-password", methods=["POST"])
@rate_limit(max_requests=5, window_seconds=300)
def forgot_password():
    data = request.get_json() or {}
    try:
        email = validate_email(data.get("email"))
        otp = create_and_store_otp(email)
        if otp:
            send_otp_email(email, otp)
        # Always return success to prevent email enumeration
        return jsonify({"message": "If the email is valid, an OTP has been sent."}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(str(e))
        return jsonify({"error": "Failed to process request."}), 500


@auth_bp.route("/auth/reset-password", methods=["POST"])
@rate_limit(max_requests=10, window_seconds=300)
def reset_password():
    data = request.get_json() or {}
    try:
        email = validate_email(data.get("email"))
        otp = data.get("otp")
        new_password = validate_password(data.get("new_password"))

        if not otp:
            return jsonify({"error": "OTP is required"}), 400

        if not verify_and_use_otp(email, otp):
            return jsonify({"error": "Invalid or expired OTP"}), 400

        hashed_password = bcrypt.hashpw(
            new_password.encode("utf-8"), bcrypt.gensalt()
        ).decode("utf-8")

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET password = %s WHERE LOWER(email) = LOWER(%s)",
                    (hashed_password, email),
                )
        return jsonify({"message": "Password has been reset successfully."}), 200
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logger.error(str(e))
        return jsonify({"error": "Failed to reset password."}), 500
