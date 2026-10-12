"""
AI Conversation Service — manages conversation history and rate limiting for AI features.

Features:
- Store conversation messages
- Retrieve conversation history for context
- Enforce daily rate limits (10 requests/student/day)
- Clean up old conversations (keep last 20 per student)
"""
import logging
from datetime import datetime, timedelta, UTC

from database import get_db_connection
from services.student_service import ensure_student_table_consistency

logger = logging.getLogger(__name__)

_AI_SCHEMA_READY = False
_DAILY_REQUEST_LIMIT = 10


def _connection_scope(connection=None):
    """Provide connection context manager."""
    from contextlib import nullcontext
    if connection is not None:
        return nullcontext(connection)
    return get_db_connection()


def ensure_ai_tables_consistency(connection=None):
    """Ensure AI-related tables exist."""
    global _AI_SCHEMA_READY
    
    if _AI_SCHEMA_READY:
        return
    
    def apply_schema(conn):
        ensure_student_table_consistency(conn)
        
        with conn.cursor() as cur:
            # Conversations table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_conversations (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    role VARCHAR(10) NOT NULL CHECK (role IN ('student', 'assistant')),
                    message TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            
            cur.execute("ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS student_id INTEGER")
            cur.execute("ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS role VARCHAR(10)")
            cur.execute("ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS message TEXT")
            cur.execute("ALTER TABLE ai_conversations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            
            cur.execute("ALTER TABLE ai_conversations DROP CONSTRAINT IF EXISTS ai_conversations_student_id_fkey")
            cur.execute(
                """
                ALTER TABLE ai_conversations
                ADD CONSTRAINT ai_conversations_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
                """
            )
            
            cur.execute("DROP INDEX IF EXISTS idx_ai_conversations_student_id")
            cur.execute("DROP INDEX IF EXISTS idx_ai_conversations_created_at")
            cur.execute(
                """
                CREATE INDEX idx_ai_conversations_student_id ON ai_conversations(student_id)
                """
            )
            cur.execute(
                """
                CREATE INDEX idx_ai_conversations_created_at ON ai_conversations(created_at DESC)
                """
            )
            
            # Rate limiting table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS ai_rate_limits (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
                    request_count INTEGER DEFAULT 0,
                    reset_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            
            cur.execute("ALTER TABLE ai_rate_limits ADD COLUMN IF NOT EXISTS student_id INTEGER")
            cur.execute("ALTER TABLE ai_rate_limits ADD COLUMN IF NOT EXISTS request_count INTEGER DEFAULT 0")
            cur.execute("ALTER TABLE ai_rate_limits ADD COLUMN IF NOT EXISTS reset_at TIMESTAMP")
            cur.execute("ALTER TABLE ai_rate_limits ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            cur.execute("ALTER TABLE ai_rate_limits ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            
            cur.execute("ALTER TABLE ai_rate_limits DROP CONSTRAINT IF EXISTS ai_rate_limits_student_id_fkey")
            cur.execute("ALTER TABLE ai_rate_limits DROP CONSTRAINT IF EXISTS ai_rate_limits_student_id_key")
            cur.execute(
                """
                ALTER TABLE ai_rate_limits
                ADD CONSTRAINT ai_rate_limits_student_id_fkey
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
                """
            )
            cur.execute(
                """
                ALTER TABLE ai_rate_limits
                ADD CONSTRAINT ai_rate_limits_student_id_key
                UNIQUE (student_id)
                """
            )
            
            cur.execute("DROP INDEX IF EXISTS idx_ai_rate_limits_student_id")
            cur.execute("DROP INDEX IF EXISTS idx_ai_rate_limits_reset_at")
            cur.execute(
                """
                CREATE INDEX idx_ai_rate_limits_student_id ON ai_rate_limits(student_id)
                """
            )
            cur.execute(
                """
                CREATE INDEX idx_ai_rate_limits_reset_at ON ai_rate_limits(reset_at)
                """
            )
    
    if connection is not None:
        apply_schema(connection)
    else:
        with get_db_connection() as conn:
            apply_schema(conn)
    
    _AI_SCHEMA_READY = True


def store_conversation(student_id: int, role: str, message: str) -> int:
    """Store a conversation message. Returns message ID."""
    with get_db_connection() as conn:
        ensure_ai_tables_consistency(conn)
        
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO ai_conversations (student_id, role, message)
                VALUES (%s, %s, %s)
                RETURNING id
                """,
                (student_id, role, message),
            )
            msg_id = cur.fetchone()[0]
    
    return msg_id


def get_conversation_history(student_id: int, limit: int = 20) -> list[dict]:
    """Retrieve recent conversation history for context building."""
    with get_db_connection() as conn:
        ensure_ai_tables_consistency(conn)
        
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, role, message, created_at
                FROM ai_conversations
                WHERE student_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (student_id, limit),
            )
            rows = cur.fetchall()
    
    # Reverse to get chronological order for context
    messages = []
    for row in reversed(rows):
        messages.append({
            "id": row[0],
            "role": row[1],
            "message": row[2],
            "created_at": str(row[3]) if row[3] else None,
        })
    
    return messages


def check_rate_limit(student_id: int) -> dict:
    """
    Check if student has reached daily limit.
    
    Returns:
    {
        "allowed": bool,
        "remaining": int,
        "reset_at": str (ISO format),
        "message": str (user-friendly message if rate limited)
    }
    """
    now = datetime.now(UTC)
    
    with get_db_connection() as conn:
        ensure_ai_tables_consistency(conn)
        
        with conn.cursor() as cur:
            # Get or create rate limit entry
            cur.execute(
                """
                SELECT id, request_count, reset_at
                FROM ai_rate_limits
                WHERE student_id = %s
                """,
                (student_id,),
            )
            limit_row = cur.fetchone()
            
            if not limit_row:
                # First request — create entry with reset time 24h from now
                reset_time = now + timedelta(days=1)
                cur.execute(
                    """
                    INSERT INTO ai_rate_limits (student_id, request_count, reset_at)
                    VALUES (%s, 0, %s)
                    """,
                    (student_id, reset_time),
                )
                limit_id, count, reset_at = None, 0, reset_time
            else:
                limit_id, count, reset_at = limit_row
                # Convert naive datetime from database to timezone-aware
                if reset_at and reset_at.tzinfo is None:
                    reset_at = reset_at.replace(tzinfo=UTC)
            
            # Check if window has expired
            if reset_at and reset_at <= now:
                # Window expired — reset counter
                reset_time = now + timedelta(days=1)
                cur.execute(
                    """
                    UPDATE ai_rate_limits
                    SET request_count = 0, reset_at = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE student_id = %s
                    """,
                    (reset_time, student_id),
                )
                count = 0
                reset_at = reset_time
    
    remaining = max(0, _DAILY_REQUEST_LIMIT - count)
    is_allowed = count < _DAILY_REQUEST_LIMIT
    
    reset_str = reset_at.isoformat() if reset_at else None
    
    return {
        "allowed": is_allowed,
        "remaining": remaining,
        "reset_at": reset_str,
        "message": None if is_allowed else f"Daily AI chat limit reached. Resets at {reset_str}.",
    }


def increment_rate_limit(student_id: int) -> None:
    """Increment request counter after successful AI call."""
    with get_db_connection() as conn:
        ensure_ai_tables_consistency(conn)
        
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE ai_rate_limits
                SET request_count = request_count + 1, updated_at = CURRENT_TIMESTAMP
                WHERE student_id = %s
                """,
                (student_id,),
            )


def build_context_from_history(conversation_history: list[dict], max_messages: int = 10) -> str:
    """Build conversation context from history for Gemini."""
    if not conversation_history:
        return ""
    
    # Take most recent messages
    recent = conversation_history[-max_messages:]
    
    context_lines = ["Recent conversation history:"]
    for msg in recent:
        role_label = "You asked" if msg["role"] == "student" else "I answered"
        context_lines.append(f"{role_label}: {msg['message'][:100]}...")
    
    return "\n".join(context_lines)


def get_quick_prompts(student_id: int, institution_id=None) -> list[dict]:
    """Get suggested quick prompts based on student profile."""
    from services.student_dashboard_service import get_student_dashboard_data
    
    try:
        data = get_student_dashboard_data(student_id, institution_id=institution_id)
    except Exception as e:
        logger.error(f"Could not fetch student data for prompts: {e}")
        data = {}
    
    score = data.get("readiness_score", 0)
    status = data.get("status", "Unknown")
    
    # Generic prompts always available
    prompts = [
        {"label": "Why is my score this low?", "id": "score_explanation"},
        {"label": "What's my biggest weakness?", "id": "weakness"},
        {"label": "What should I focus on?", "id": "action"},
    ]
    
    # Contextual prompts
    if score < 60:
        prompts.append({
            "label": "How can I improve fast?",
            "id": "improve_fast"
        })
    
    if score >= 60:
        prompts.append({
            "label": "Am I placement ready?",
            "id": "placement_ready"
        })
    
    if data.get("risk_level") == "Critical":
        prompts.append({
            "label": "What's causing this risk?",
            "id": "risk_analysis"
        })
    
    return prompts


def clear_old_conversations(student_id: int, keep_count: int = 20) -> int:
    """Delete old conversation messages, keeping most recent."""
    with get_db_connection() as conn:
        ensure_ai_tables_consistency(conn)
        
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM ai_conversations
                WHERE student_id = %s AND id NOT IN (
                    SELECT id FROM ai_conversations
                    WHERE student_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                )
                """,
                (student_id, student_id, keep_count),
            )
            deleted = cur.rowcount
    
    return deleted
