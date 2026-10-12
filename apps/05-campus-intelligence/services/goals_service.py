"""
Goal Tracking Service - Phase 3 Feature

Allows students to set personal academic goals, track milestones,
and earn badges. Faculty/Admins can view goal statistics.
"""
import logging
from datetime import datetime, date, UTC
from contextlib import nullcontext
from database import db_cursor
from database import get_db_connection

logger = logging.getLogger(__name__)

# ── Badge thresholds ──────────────────────────────────────────────────────────

BADGES = [
    {"id": "first_goal",    "name": "Goal Setter",    "icon": "🎯", "desc": "Created your first goal"},
    {"id": "on_track",      "name": "On Track",       "icon": "🚀", "desc": "Completed 3 goals"},
    {"id": "achiever",      "name": "Achiever",       "icon": "🏆", "desc": "Completed 5 goals"},
    {"id": "perfectionist", "name": "Perfectionist",  "icon": "⭐", "desc": "Completed 10 goals"},
    {"id": "consistent",    "name": "Consistent",     "icon": "🔥", "desc": "Active goal streak for 7 days"},
]


# ── Schema bootstrap ─────────────────────────────────────────────────────────

def ensure_goals_tables(connection=None):
    """Create goals-related tables if they don't exist."""
    context = nullcontext(connection) if connection is not None else get_db_connection()
    with context as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS student_goals (
                    id              SERIAL PRIMARY KEY,
                    student_id      INTEGER NOT NULL,
                    title           VARCHAR(200) NOT NULL,
                    description     TEXT,
                    category        VARCHAR(50) DEFAULT 'academic',
                    target_value    NUMERIC(10, 2),
                    current_value   NUMERIC(10, 2) DEFAULT 0,
                    unit            VARCHAR(50),
                    target_date     DATE,
                    status          VARCHAR(20) DEFAULT 'active'
                                    CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
                    priority        VARCHAR(10) DEFAULT 'medium'
                                    CHECK (priority IN ('low', 'medium', 'high')),
                    created_at      TIMESTAMPTZ DEFAULT NOW(),
                    updated_at      TIMESTAMPTZ DEFAULT NOW(),
                    completed_at    TIMESTAMPTZ
                );

                CREATE TABLE IF NOT EXISTS goal_milestones (
                    id          SERIAL PRIMARY KEY,
                    goal_id     INTEGER NOT NULL REFERENCES student_goals(id) ON DELETE CASCADE,
                    title       VARCHAR(200) NOT NULL,
                    is_done     BOOLEAN DEFAULT FALSE,
                    done_at     TIMESTAMPTZ,
                    created_at  TIMESTAMPTZ DEFAULT NOW()
                );

                CREATE TABLE IF NOT EXISTS student_badges (
                    id          SERIAL PRIMARY KEY,
                    student_id  INTEGER NOT NULL,
                    badge_id    VARCHAR(50) NOT NULL,
                    earned_at   TIMESTAMPTZ DEFAULT NOW(),
                    UNIQUE (student_id, badge_id)
                );
            """)
    logger.info("Goal tables ready.")


# ── CRUD helpers ──────────────────────────────────────────────────────────────

def _row_to_goal(row):
    return {
        "id":            row[0],
        "student_id":    row[1],
        "title":         row[2],
        "description":   row[3],
        "category":      row[4],
        "target_value":  float(row[5]) if row[5] is not None else None,
        "current_value": float(row[6]) if row[6] is not None else 0,
        "unit":          row[7],
        "target_date":   row[8].isoformat() if row[8] else None,
        "status":        row[9],
        "priority":      row[10],
        "created_at":    row[11].isoformat() if row[11] else None,
        "updated_at":    row[12].isoformat() if row[12] else None,
        "completed_at":  row[13].isoformat() if row[13] else None,
        "progress_pct":  _calc_progress(row[6], row[5]),
    }


def _calc_progress(current, target):
    try:
        if target and float(target) > 0:
            return min(100, round(float(current or 0) / float(target) * 100, 1))
    except Exception:
        pass
    return 0


# ── Public API ────────────────────────────────────────────────────────────────

def create_goal(student_id: int, data: dict) -> dict:
    """Create a new goal for a student."""
    title        = data.get("title", "").strip()
    description  = data.get("description", "")
    category     = data.get("category", "academic")
    target_value = data.get("target_value")
    unit         = data.get("unit", "")
    target_date  = data.get("target_date")
    priority     = data.get("priority", "medium")

    if not title:
        return {"error": "Goal title is required"}

    with db_cursor() as cur:
        cur.execute("""
            INSERT INTO student_goals
              (student_id, title, description, category, target_value, unit, target_date, priority)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (student_id, title, description, category, target_value, unit, target_date, priority))
        goal_id = cur.fetchone()[0]

    _check_and_award_badges(student_id)
    return {"id": goal_id, "message": "Goal created successfully"}


def get_student_goals(student_id: int, status: str | None = None) -> list:
    """Return all goals for a student, optionally filtered by status."""
    with db_cursor() as cur:
        if status:
            cur.execute("""
                SELECT id, student_id, title, description, category,
                       target_value, current_value, unit, target_date, status,
                       priority, created_at, updated_at, completed_at
                FROM student_goals
                WHERE student_id = %s AND status = %s
                ORDER BY
                  CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  created_at DESC
            """, (student_id, status))
        else:
            cur.execute("""
                SELECT id, student_id, title, description, category,
                       target_value, current_value, unit, target_date, status,
                       priority, created_at, updated_at, completed_at
                FROM student_goals
                WHERE student_id = %s
                ORDER BY
                  CASE status WHEN 'active' THEN 1 WHEN 'paused' THEN 2
                              WHEN 'completed' THEN 3 ELSE 4 END,
                  CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
                  created_at DESC
            """, (student_id,))
        rows = cur.fetchall()

    return [_row_to_goal(r) for r in rows]


def update_goal_progress(goal_id: int, student_id: int, current_value: float) -> dict:
    """Update a goal's current value and auto-complete when target is hit."""
    with db_cursor() as cur:
        cur.execute("""
            SELECT target_value, status FROM student_goals
            WHERE id = %s AND student_id = %s
        """, (goal_id, student_id))
        row = cur.fetchone()
        if not row:
            return {"error": "Goal not found"}

        target, status = row
        if status == "completed":
            return {"error": "Goal is already completed"}

        new_status = status
        completed_at = None
        if target and float(current_value) >= float(target):
            new_status = "completed"
            completed_at = datetime.now(UTC)

        cur.execute("""
            UPDATE student_goals
            SET current_value = %s,
                status = %s,
                completed_at = %s,
                updated_at = NOW()
            WHERE id = %s AND student_id = %s
        """, (current_value, new_status, completed_at, goal_id, student_id))

    if new_status == "completed":
        _check_and_award_badges(student_id)
        return {"message": "Goal completed! 🎉", "status": "completed"}

    return {"message": "Progress updated", "status": new_status}


def update_goal(goal_id: int, student_id: int, data: dict) -> dict:
    """Update goal metadata (title, description, priority, etc.)."""
    allowed = ["title", "description", "category", "target_value",
               "unit", "target_date", "priority", "status"]
    updates = {k: v for k, v in data.items() if k in allowed}
    if not updates:
        return {"error": "No valid fields to update"}

    set_clause = ", ".join(f"{k} = %s" for k in updates)
    values = list(updates.values()) + [goal_id, student_id]

    with db_cursor() as cur:
        cur.execute(f"""
            UPDATE student_goals
            SET {set_clause}, updated_at = NOW()
            WHERE id = %s AND student_id = %s
        """, values)
        if cur.rowcount == 0:
            return {"error": "Goal not found"}

    return {"message": "Goal updated"}


def delete_goal(goal_id: int, student_id: int) -> dict:
    """Delete a goal (and its milestones via CASCADE)."""
    with db_cursor() as cur:
        cur.execute("DELETE FROM student_goals WHERE id = %s AND student_id = %s",
                    (goal_id, student_id))
        if cur.rowcount == 0:
            return {"error": "Goal not found"}
    return {"message": "Goal deleted"}


# ── Milestones ────────────────────────────────────────────────────────────────

def get_milestones(goal_id: int, student_id: int) -> list:
    """Return milestones for a goal (verifying ownership)."""
    with db_cursor() as cur:
        cur.execute("""
            SELECT gm.id, gm.title, gm.is_done, gm.done_at, gm.created_at
            FROM goal_milestones gm
            JOIN student_goals sg ON gm.goal_id = sg.id
            WHERE gm.goal_id = %s AND sg.student_id = %s
            ORDER BY gm.created_at
        """, (goal_id, student_id))
        rows = cur.fetchall()
    return [{"id": r[0], "title": r[1], "is_done": r[2],
             "done_at": r[3].isoformat() if r[3] else None} for r in rows]


def add_milestone(goal_id: int, student_id: int, title: str) -> dict:
    """Add a milestone to a goal."""
    with db_cursor() as cur:
        # Ownership check
        cur.execute("SELECT id FROM student_goals WHERE id = %s AND student_id = %s",
                    (goal_id, student_id))
        if not cur.fetchone():
            return {"error": "Goal not found"}
        cur.execute("""
            INSERT INTO goal_milestones (goal_id, title) VALUES (%s, %s) RETURNING id
        """, (goal_id, title))
        ms_id = cur.fetchone()[0]
    return {"id": ms_id, "message": "Milestone added"}


def toggle_milestone(milestone_id: int, student_id: int) -> dict:
    """Toggle a milestone's done state."""
    with db_cursor() as cur:
        cur.execute("""
            UPDATE goal_milestones gm
            SET is_done = NOT gm.is_done,
                done_at = CASE WHEN NOT gm.is_done THEN NOW() ELSE NULL END
            FROM student_goals sg
            WHERE gm.id = %s AND gm.goal_id = sg.id AND sg.student_id = %s
            RETURNING gm.is_done
        """, (milestone_id, student_id))
        row = cur.fetchone()
        if not row:
            return {"error": "Milestone not found"}
    return {"is_done": row[0], "message": "Milestone updated"}


# ── Badges ────────────────────────────────────────────────────────────────────

def _check_and_award_badges(student_id: int):
    """Award any newly earned badges to the student."""
    with db_cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM student_goals
            WHERE student_id = %s AND status = 'completed'
        """, (student_id,))
        completed = cur.fetchone()[0]

        cur.execute("""
            SELECT COUNT(*) FROM student_goals WHERE student_id = %s
        """, (student_id,))
        total = cur.fetchone()[0]

        to_award = []
        if total >= 1:
            to_award.append("first_goal")
        if completed >= 3:
            to_award.append("on_track")
        if completed >= 5:
            to_award.append("achiever")
        if completed >= 10:
            to_award.append("perfectionist")

        for badge_id in to_award:
            cur.execute("""
                INSERT INTO student_badges (student_id, badge_id)
                VALUES (%s, %s) ON CONFLICT DO NOTHING
            """, (student_id, badge_id))


def get_student_badges(student_id: int) -> list:
    """Return all badges earned by the student."""
    with db_cursor() as cur:
        cur.execute("""
            SELECT badge_id, earned_at FROM student_badges
            WHERE student_id = %s ORDER BY earned_at
        """, (student_id,))
        rows = cur.fetchall()

    badge_map = {b["id"]: b for b in BADGES}
    result = []
    for badge_id, earned_at in rows:
        if badge_id in badge_map:
            b = dict(badge_map[badge_id])
            b["earned_at"] = earned_at.isoformat() if earned_at else None
            result.append(b)
    return result


def get_goal_summary(student_id: int) -> dict:
    """Return a stats summary for the student's goals."""
    with db_cursor() as cur:
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE status = 'active')    AS active,
              COUNT(*) FILTER (WHERE status = 'completed') AS completed,
              COUNT(*) FILTER (WHERE status = 'paused')    AS paused,
              COUNT(*)                                      AS total
            FROM student_goals WHERE student_id = %s
        """, (student_id,))
        row = cur.fetchone()

    active, completed, paused, total = (row or (0, 0, 0, 0))
    completion_rate = round(completed / total * 100) if total else 0

    return {
        "active":          active,
        "completed":       completed,
        "paused":          paused,
        "total":           total,
        "completion_rate": completion_rate,
        "badges":          get_student_badges(student_id),
    }
