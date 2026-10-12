from contextlib import contextmanager
import atexit

import psycopg2
from psycopg2.pool import ThreadedConnectionPool

from config import settings


_DB_POOL = None


def _build_connect_kwargs():
    if settings.database_url:
        connect_kwargs = {
            "dsn": settings.database_url,
            "connect_timeout": settings.db_connect_timeout,
        }
        if settings.db_ssl_mode:
            connect_kwargs["sslmode"] = settings.db_ssl_mode
        return connect_kwargs

    connect_kwargs = {
        "host": settings.db_host,
        "database": settings.db_name,
        "user": settings.db_user,
        "password": settings.db_password,
        "port": settings.db_port,
        "connect_timeout": settings.db_connect_timeout,
    }
    if settings.db_ssl_mode:
        connect_kwargs["sslmode"] = settings.db_ssl_mode
    return connect_kwargs


def get_db_pool():
    global _DB_POOL

    if _DB_POOL is None:
        _DB_POOL = ThreadedConnectionPool(
            minconn=settings.db_pool_minconn,
            maxconn=settings.db_pool_maxconn,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=5,
            **_build_connect_kwargs(),
        )

    return _DB_POOL


def close_db_pool():
    global _DB_POOL

    if _DB_POOL is not None:
        _DB_POOL.closeall()
        _DB_POOL = None


atexit.register(close_db_pool)


@contextmanager
def get_db_connection():
    conn = get_db_pool().getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        get_db_pool().putconn(conn)


def release_db_connection(conn, *, close=False):
    if conn is None:
        return

    if close:
        conn.close()
        return

    get_db_pool().putconn(conn)


@contextmanager
def db_connection(commit=False):
    with get_db_connection() as conn:
        yield conn


@contextmanager
def db_cursor(commit=True):
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            yield cur
