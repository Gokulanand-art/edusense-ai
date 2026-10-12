-- Migration 015: Performance Hardening & Composite Indexes
-- Adds missing composite indexes to support the most frequent query patterns:
--   - Institution-scoped leaderboards and analytics
--   - Tenant-aware attendance/marks aggregation
--   - Notification inbox queries
--   - Peer learning feed
--   - Audit log pagination

-- ── Students ────────────────────────────────────────────────────────────────
-- Used by readiness score CTE and faculty watchlist sorts
CREATE INDEX IF NOT EXISTS idx_students_institution_dept
    ON students (institution_id, department);

CREATE INDEX IF NOT EXISTS idx_students_institution_created
    ON students (institution_id, created_at DESC);

-- ── Marks ───────────────────────────────────────────────────────────────────
-- Core of the readiness score: per-student average marks query
CREATE INDEX IF NOT EXISTS idx_marks_student_id
    ON marks (student_id);

CREATE INDEX IF NOT EXISTS idx_marks_subject_student
    ON marks (subject_id, student_id);

-- ── Attendance ───────────────────────────────────────────────────────────────
-- Attendance percentage CTE: COUNT(*) FILTER (WHERE status='Present') per student
CREATE INDEX IF NOT EXISTS idx_attendance_student_status
    ON attendance (student_id, status);

CREATE INDEX IF NOT EXISTS idx_attendance_subject_date
    ON attendance (subject_id, date DESC);

-- ── Mock tests ───────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mock_tests_student_id
    ON mock_tests (student_id);

-- ── Student skills ───────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_student_skills_student_id
    ON student_skills (student_id);

-- ── Notifications ───────────────────────────────────────────────────────────
-- Inbox: latest unread for a user
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
    ON notifications (user_id, is_read, created_at DESC);

-- ── Audit logs ──────────────────────────────────────────────────────────────
-- Admin audit log pagination, filtered by institution
CREATE INDEX IF NOT EXISTS idx_audit_logs_institution_created
    ON audit_logs (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
    ON audit_logs (actor_user_id, created_at DESC);

-- ── Goals ───────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'student_goals'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_student_goals_student_status
            ON student_goals (student_id, status);
    END IF;
END
$$;

-- ── Notices ─────────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notices'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'notices'
              AND column_name = 'is_active'
        ) THEN
            CREATE INDEX IF NOT EXISTS idx_notices_institution_active_created
                ON notices (institution_id, is_active, created_at DESC);
        ELSIF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'notices'
              AND column_name = 'publish_at'
        ) THEN
            CREATE INDEX IF NOT EXISTS idx_notices_institution_publish_created
                ON notices (institution_id, publish_at DESC, created_at DESC);
        END IF;
    END IF;
END
$$;

-- ── Placement companies ──────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'placement_companies'
    ) THEN
        -- Company matching engine: sorted by package_lpa DESC, filtered by minimums
        CREATE INDEX IF NOT EXISTS idx_companies_package_lpa
            ON placement_companies (package_lpa DESC);

        CREATE INDEX IF NOT EXISTS idx_companies_min_cgpa_package
            ON placement_companies (min_cgpa, package_lpa DESC);
    END IF;
END
$$;

-- ── Peer learning ────────────────────────────────────────────────────────────
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'peer_achievements'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_peer_achievements_student_type
            ON peer_achievements (student_id, achievement_type);

        CREATE INDEX IF NOT EXISTS idx_peer_achievements_created
            ON peer_achievements (created_at DESC);
    END IF;
END
$$;

-- ── JWT blacklist ────────────────────────────────────────────────────────────
-- Every authenticated request hits this table; the lookup must be fast
CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_jti
    ON jwt_blacklist (jti);

-- Older deployments may not store token expiry in this table.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'jwt_blacklist'
          AND column_name = 'expires_at'
    ) THEN
        CREATE INDEX IF NOT EXISTS idx_jwt_blacklist_expires_at
            ON jwt_blacklist (expires_at)
            WHERE expires_at IS NOT NULL;
    END IF;
END
$$;

-- ── Marks: add max_marks column (for bulk entry feature) ─────────────────────
ALTER TABLE marks ADD COLUMN IF NOT EXISTS max_marks INTEGER DEFAULT 100;
ALTER TABLE marks ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
