from dataclasses import dataclass
from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


def _to_bool(value):
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _default_debug():
    flask_env = os.getenv("FLASK_ENV", "development")
    return "true" if flask_env.strip().lower() == "development" else "false"


def _get_env(name, default=None, *, aliases=None, required=False, cast=str):
    candidates = [name, *(aliases or [])]

    for candidate in candidates:
        value = os.getenv(candidate)
        if value is not None and str(value).strip() != "":
            return cast(value)

    if default is not None:
        return cast(default)

    if required:
        alias_list = ", ".join(candidates)
        raise RuntimeError(f"Missing required environment variable. Expected one of: {alias_list}")

    return None


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    db_host: str | None
    db_name: str | None
    db_user: str | None
    db_password: str | None
    db_port: int
    db_connect_timeout: int
    db_ssl_mode: str | None
    jwt_secret: str
    jwt_algorithm: str
    jwt_exp_hours: int
    flask_secret_key: str
    flask_env: str
    flask_debug: bool
    app_name: str
    app_url: str
    log_level: str
    strict_startup_validation: bool
    db_pool_minconn: int
    db_pool_maxconn: int
    trust_proxy_count: int
    web_concurrency: int
    gunicorn_threads: int
    auth_cookie_name: str
    auth_cookie_secure: bool
    auth_cookie_samesite: str
    auth_cookie_domain: str | None
    cors_allowed_origins: str | None
    release_version: str
    release_commit: str | None
    
    # Email settings for OTP
    smtp_server: str
    smtp_port: int
    smtp_username: str | None
    smtp_password: str | None
    mail_default_sender: str
    
    # Gemini AI settings
    gemini_api_key: str | None
    gemini_model: str


settings = Settings(
    database_url=_get_env("DATABASE_URL"),
    db_host=_get_env("DB_HOST"),
    db_name=_get_env("DB_NAME"),
    db_user=_get_env("DB_USER"),
    db_password=_get_env("DB_PASSWORD"),
    db_port=_get_env("DB_PORT", default="5432", cast=int),
    db_connect_timeout=_get_env("DB_CONNECT_TIMEOUT", default="10", cast=int),
    db_ssl_mode=_get_env("DB_SSL_MODE"),
    jwt_secret=_get_env("JWT_SECRET", aliases=["JWT_SECRET_KEY", "SECRET_KEY"], required=True),
    jwt_algorithm=_get_env("JWT_ALGORITHM", default="HS256"),
    jwt_exp_hours=_get_env("JWT_EXP_HOURS", default="24", cast=int),
    flask_secret_key=_get_env("SECRET_KEY", aliases=["JWT_SECRET"], required=True),
    flask_env=_get_env("FLASK_ENV", default="development"),
    flask_debug=_get_env("FLASK_DEBUG", default=_default_debug(), cast=_to_bool),
    app_name=_get_env("APP_NAME", default="Smart Campus Intelligence System"),
    app_url=_get_env("APP_URL", default="http://localhost:5000"),
    log_level=_get_env("LOG_LEVEL", default="INFO").upper(),
    strict_startup_validation=_get_env(
        "STRICT_STARTUP_VALIDATION",
        default="false" if _to_bool(_default_debug()) else "true",
        cast=_to_bool,
    ),
    db_pool_minconn=_get_env("DB_POOL_MINCONN", default="1", cast=int),
    db_pool_maxconn=_get_env("DB_POOL_MAXCONN", default="10", cast=int),
    trust_proxy_count=_get_env("TRUST_PROXY_COUNT", default="1", cast=int),
    web_concurrency=_get_env("WEB_CONCURRENCY", default="2", cast=int),
    gunicorn_threads=_get_env("GUNICORN_THREADS", default="2", cast=int),
    auth_cookie_name=_get_env("AUTH_COOKIE_NAME", default="smart_campus_token"),
    auth_cookie_secure=_get_env(
        "AUTH_COOKIE_SECURE",
        default="false" if _to_bool(_default_debug()) else "true",
        cast=_to_bool,
    ),
    auth_cookie_samesite=_get_env("AUTH_COOKIE_SAMESITE", default="Lax"),
    auth_cookie_domain=_get_env("AUTH_COOKIE_DOMAIN"),
    cors_allowed_origins=_get_env("CORS_ALLOWED_ORIGINS"),
    release_version=_get_env("RELEASE_VERSION", default="dev"),
    release_commit=_get_env("RENDER_GIT_COMMIT", aliases=["RELEASE_COMMIT", "COMMIT_SHA"]),
    smtp_server=_get_env("SMTP_SERVER", default="smtp.gmail.com"),
    smtp_port=_get_env("SMTP_PORT", default="587", cast=int),
    smtp_username=_get_env("SMTP_USERNAME"),
    smtp_password=_get_env("SMTP_PASSWORD"),
    mail_default_sender=_get_env("MAIL_DEFAULT_SENDER", default="noreply@smartcampus.com"),
    gemini_api_key=_get_env("GEMINI_API_KEY"),
    gemini_model=_get_env("GEMINI_MODEL", default="gemini-2.0-flash"),
)
