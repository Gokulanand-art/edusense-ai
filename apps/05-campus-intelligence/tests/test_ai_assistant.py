"""
Integration tests for AI Assistant feature.
Tests conversation history, rate limiting, and Gemini integration.
"""
import pytest
from datetime import datetime, timedelta, UTC

from services.ai_conversation_service import (
    ensure_ai_tables_consistency,
    store_conversation,
    get_conversation_history,
    check_rate_limit,
    increment_rate_limit,
    get_quick_prompts,
)
from database import get_db_connection


@pytest.fixture(scope="function")
def setup_ai_db():
    """Ensure AI tables exist."""
    with get_db_connection() as conn:
        ensure_ai_tables_consistency(conn)
        with conn.cursor() as cur:
            for i in range(1, 8):
                cur.execute(
                    "INSERT INTO students (id, name, department) VALUES (%s, 'Test Student', 'CS') ON CONFLICT (id) DO NOTHING",
                    (i,)
                )
        conn.commit()
    yield
    # Cleanup: delete test data if needed
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM ai_conversations")
            cur.execute("DELETE FROM ai_rate_limits")


def test_store_conversation(setup_ai_db):
    """Test storing a conversation message."""
    student_id = 1
    msg_id = store_conversation(student_id, "student", "What's my score?")
    assert msg_id > 0
    
    # Verify it was stored
    history = get_conversation_history(student_id)
    assert len(history) == 1
    assert history[0]["message"] == "What's my score?"
    assert history[0]["role"] == "student"


def test_conversation_history_order(setup_ai_db):
    """Test that conversation history is returned in chronological order."""
    student_id = 2
    
    # Store 3 messages
    store_conversation(student_id, "student", "First message")
    store_conversation(student_id, "assistant", "First response")
    store_conversation(student_id, "student", "Second message")
    
    history = get_conversation_history(student_id)
    assert len(history) == 3
    assert history[0]["message"] == "First message"
    assert history[1]["message"] == "First response"
    assert history[2]["message"] == "Second message"


def test_rate_limit_first_request(setup_ai_db):
    """Test rate limit tracking for first request."""
    student_id = 3
    
    result = check_rate_limit(student_id)
    assert result["allowed"] is True
    assert result["remaining"] == 10
    assert result["message"] is None


def test_rate_limit_increments(setup_ai_db):
    """Test rate limit incrementation."""
    student_id = 4
    
    # Make 10 requests
    for _ in range(10):
        check = check_rate_limit(student_id)
        assert check["allowed"] is True
        increment_rate_limit(student_id)
    
    # 11th request should be blocked
    result = check_rate_limit(student_id)
    assert result["allowed"] is False
    assert result["remaining"] == 0
    assert "Daily AI chat limit reached" in result["message"]


def test_rate_limit_reset(setup_ai_db):
    """Test rate limit resets after 24 hours."""
    student_id = 5
    
    # Manually set an old reset_at to simulate expired window
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Use old timestamp (24+ hours ago)
            old_reset = (datetime.now(UTC) - timedelta(days=2)).isoformat()
            cur.execute(
                """
                INSERT INTO ai_rate_limits (student_id, request_count, reset_at)
                VALUES (%s, 10, %s)
                """,
                (student_id, old_reset),
            )
    
    # Check should reset the window
    result = check_rate_limit(student_id)
    assert result["allowed"] is True
    assert result["remaining"] == 10


def test_quick_prompts(setup_ai_db):
    """Test quick prompts generation."""
    student_id = 6
    
    # Create student profile for this test
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO students (id, name, department) VALUES (%s, %s, %s) ON CONFLICT DO NOTHING",
                (student_id, "Test Student", "CS"),
            )
    
    prompts = get_quick_prompts(student_id)
    assert len(prompts) > 0
    
    # Should have at least the basic prompts
    prompt_labels = [p["label"] for p in prompts]
    assert any("score" in label.lower() or "weakness" in label.lower() for label in prompt_labels)


def test_conversation_history_limit(setup_ai_db):
    """Test that conversation history respects limit."""
    student_id = 7
    
    # Store 30 messages
    for i in range(30):
        store_conversation(student_id, "student" if i % 2 == 0 else "assistant", f"Message {i}")
    
    # Retrieve with limit of 10
    history = get_conversation_history(student_id, limit=10)
    assert len(history) == 10
    
    # Should be the last 10 messages (chronologically)
    assert "Message 20" in history[0]["message"]
    assert "Message 29" in history[-1]["message"]
