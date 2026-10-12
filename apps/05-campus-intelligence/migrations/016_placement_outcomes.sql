-- Migration 016: Placement Outcomes — closes the feedback loop
-- Tracks who got placed, where, at what package, and when.
-- This is the single most important statistic for any campus placement cell.
-- Data flows: Admin/Student records outcome → Placement Statistics dashboard reads it.

BEGIN;

-- ── placement_outcomes ────────────────────────────────────────────────────────
-- Central table: each row is one placement offer received by a student.
CREATE TABLE IF NOT EXISTS placement_outcomes (
    id                  SERIAL PRIMARY KEY,
    student_id          INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    company_id          INTEGER REFERENCES placement_companies(id) ON DELETE SET NULL,
    company_name        TEXT NOT NULL,           -- denormalized for when company_id is NULL
    package_lpa         DECIMAL(6, 2) NOT NULL,
    role_title          TEXT,                    -- e.g. "Software Engineer", "Data Analyst"
    offer_type          VARCHAR(20) DEFAULT 'full_time'
                            CHECK (offer_type IN ('full_time', 'internship', 'ppo', 'contract')),
    status              VARCHAR(20) DEFAULT 'offered'
                            CHECK (status IN ('offered', 'accepted', 'declined', 'joined')),
    offer_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    joining_date        DATE,
    institution_id      INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    recorded_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,  -- admin who recorded it
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now(),
    updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_outcomes_student
    ON placement_outcomes (student_id);
CREATE INDEX IF NOT EXISTS idx_placement_outcomes_institution_date
    ON placement_outcomes (institution_id, offer_date DESC);
CREATE INDEX IF NOT EXISTS idx_placement_outcomes_company
    ON placement_outcomes (company_id, institution_id);
CREATE INDEX IF NOT EXISTS idx_placement_outcomes_status
    ON placement_outcomes (institution_id, status, offer_date DESC);

-- ── placement_drives ──────────────────────────────────────────────────────────
-- Tracks on-campus placement drives (visit events). Each drive can produce
-- multiple outcomes. Links placement_outcomes → placement_drives.
CREATE TABLE IF NOT EXISTS placement_drives (
    id                  SERIAL PRIMARY KEY,
    company_id          INTEGER REFERENCES placement_companies(id) ON DELETE SET NULL,
    company_name        TEXT NOT NULL,
    drive_date          DATE NOT NULL,
    drive_type          VARCHAR(20) DEFAULT 'on_campus'
                            CHECK (drive_type IN ('on_campus', 'off_campus', 'virtual', 'pool')),
    departments         TEXT[],                  -- eligible departments
    min_cgpa            DECIMAL(3, 2),
    roles_offered       TEXT[],
    packages_offered    TEXT,
    total_selected      INTEGER DEFAULT 0,
    institution_id      INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    conducted_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_placement_drives_institution_date
    ON placement_drives (institution_id, drive_date DESC);

-- ── Add drive_id to placement_outcomes ────────────────────────────────────────
ALTER TABLE placement_outcomes
    ADD COLUMN IF NOT EXISTS drive_id INTEGER REFERENCES placement_drives(id) ON DELETE SET NULL;

COMMIT;
