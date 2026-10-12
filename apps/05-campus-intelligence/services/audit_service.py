import json
import logging
from contextlib import nullcontext
from typing import Any

from database import get_db_connection

logger = logging.getLogger(__name__)


def _connection_scope(connection=None):
    return nullcontext(connection) if connection is not None else get_db_connection()


def ensure_audit_table(connection=None):
    with _connection_scope(connection) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_logs (
                    id SERIAL PRIMARY KEY,
                    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
                    action VARCHAR(120) NOT NULL,
                    entity_type VARCHAR(80),
                    entity_id VARCHAR(120),
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    ip_address VARCHAR(64),
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )


def record_audit_event(
    action: str,
    *,
    actor_user_id: int | None = None,
    institution_id: int | None = None,
    entity_type: str | None = None,
    entity_id: Any = None,
    metadata: dict[str, Any] | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    connection=None,
):
    try:
        with _connection_scope(connection) as conn:
            ensure_audit_table(conn)
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs (
                        actor_user_id, institution_id, action, entity_type,
                        entity_id, metadata, ip_address, user_agent
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                    RETURNING id
                    """,
                    (
                        actor_user_id,
                        institution_id,
                        action,
                        entity_type,
                        str(entity_id) if entity_id is not None else None,
                        json.dumps(metadata or {}),
                        ip_address,
                        user_agent,
                    ),
                )
                row = cur.fetchone()
                return row[0] if row else None
    except Exception:
        logger.exception("Failed to record audit event")
        return None


def list_audit_events(institution_id=None, limit=100):
    safe_limit = max(1, min(int(limit or 100), 500))
    with get_db_connection() as conn:
        ensure_audit_table(conn)
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    al.id,
                    al.actor_user_id,
                    COALESCE(u.name, u.email, 'System') AS actor_name,
                    al.institution_id,
                    COALESCE(i.name, 'Global') AS institution_name,
                    al.action,
                    al.entity_type,
                    al.entity_id,
                    al.metadata,
                    al.ip_address,
                    al.created_at
                FROM audit_logs al
                LEFT JOIN users u ON u.id = al.actor_user_id
                LEFT JOIN institutions i ON i.id = al.institution_id
                WHERE (%s IS NULL OR al.institution_id = %s)
                ORDER BY al.created_at DESC, al.id DESC
                LIMIT %s
                """,
                (institution_id, institution_id, safe_limit),
            )
            rows = cur.fetchall()

    return [
        {
            "id": row[0],
            "actor_user_id": row[1],
            "actor_name": row[2],
            "institution_id": row[3],
            "institution_name": row[4],
            "action": row[5],
            "entity_type": row[6],
            "entity_id": row[7],
            "metadata": row[8] or {},
            "ip_address": row[9],
            "created_at": row[10].isoformat() if row[10] else None,
        }
        for row in rows
    ]
