type Migration = { name: string; sql: string };

/**
 * Idempotent SQL migrations. Real PostgreSQL DDL — CHECK constraints, partial
 * unique indexes, FK cascades and generated columns all work on pglite.
 */
export const migrations: Migration[] = [
  {
    name: "001_core_identity",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id              text PRIMARY KEY,
        email           text NOT NULL UNIQUE,
        password_hash   text NOT NULL,
        role            text NOT NULL CHECK (role IN ('STUDENT','FACULTY','HOD','ADMIN','PARENT')),
        first_name      text NOT NULL,
        last_name       text NOT NULL,
        phone           text,
        avatar_url      text,
        is_active       boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

      CREATE TABLE IF NOT EXISTS departments (
        id          text PRIMARY KEY,
        code        text NOT NULL UNIQUE,
        name        text NOT NULL,
        hod_user_id text REFERENCES users(id) ON DELETE SET NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS programs (
        id              text PRIMARY KEY,
        department_id   text NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        code            text NOT NULL UNIQUE,
        name            text NOT NULL,
        duration_semesters int NOT NULL CHECK (duration_semesters > 0),
        created_at      timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS batches (
        id          text PRIMARY KEY,
        program_id  text NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        code        text NOT NULL UNIQUE,
        name        text NOT NULL,
        start_year  int NOT NULL,
        section     text,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "002_students_faculty_subjects",
    sql: `
      CREATE TABLE IF NOT EXISTS students (
        id                 text PRIMARY KEY,
        user_id            text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        roll_number        text NOT NULL UNIQUE,
        registration_no    text NOT NULL UNIQUE,
        batch_id           text NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        program_id         text NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        department_id      text NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        admission_date     date NOT NULL,
        current_semester   int NOT NULL DEFAULT 1 CHECK (current_semester > 0),
        father_name        text,
        mother_name        text,
        is_active          boolean NOT NULL DEFAULT true,
        created_at         timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_students_batch ON students(batch_id);
      CREATE INDEX IF NOT EXISTS idx_students_dept ON students(department_id);

      CREATE TABLE IF NOT EXISTS parents (
        id          text PRIMARY KEY,
        user_id     text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        student_id  text NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
        relation    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS faculty (
        id             text PRIMARY KEY,
        user_id        text NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        employee_id    text NOT NULL UNIQUE,
        department_id  text NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        designation    text NOT NULL,
        joining_date   date NOT NULL,
        is_active      boolean NOT NULL DEFAULT true,
        created_at     timestamptz NOT NULL DEFAULT now()
      );

      -- subjects: credits drive CGPA; exam_eligibility_threshold is the
      -- per-subject minimum a student must hold to register for that subject's
      -- exam. Defaults to the UGC/AICTE-mandated 75%.
      CREATE TABLE IF NOT EXISTS subjects (
        id                             text PRIMARY KEY,
        code                           text NOT NULL UNIQUE,
        name                           text NOT NULL,
        credits                        int NOT NULL CHECK (credits > 0),
        program_id                     text NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
        department_id                  text NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        semester                       int NOT NULL CHECK (semester > 0),
        subject_type                   text NOT NULL DEFAULT 'THEORY'
                                         CHECK (subject_type IN ('THEORY','LAB','TUTORIAL','PROJECT')),
        exam_eligibility_threshold     numeric(5,2) NOT NULL DEFAULT 75
                                         CHECK (exam_eligibility_threshold BETWEEN 0 AND 100),
        created_at                     timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_subjects_sem ON subjects(program_id, semester);

      CREATE TABLE IF NOT EXISTS subject_faculty (
        subject_id  text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        faculty_id  text NOT NULL REFERENCES faculty(id) ON DELETE CASCADE,
        is_primary  boolean NOT NULL DEFAULT false,
        PRIMARY KEY (subject_id, faculty_id)
      );
    `,
  },
  {
    name: "003_attendance_with_leave_credit",
    sql: `
      -- One row per (student, subject, class-date). This is the event log that
      -- every attendance percentage and every leave-impact projection is
      -- derived from.
      --
      -- Key design decision vs. conventional ERPs: ON_DUTY and EXCUSED are
      -- *credit-bearing absences*. They count toward held classes but are NOT
      -- counted as attended, so a student who takes approved leave is
      -- penalised only if the leave is unapproved/rejected. Condoned absence is
      -- handled by condonation_pct, not by faking a PRESENT row.
      CREATE TABLE IF NOT EXISTS attendance (
        id           text PRIMARY KEY,
        student_id   text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject_id   text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        class_date   date NOT NULL,
        period_no    int NOT NULL DEFAULT 1 CHECK (period_no > 0),
        status       text NOT NULL CHECK (status IN
                     ('PRESENT','ABSENT','LATE','HALF_DAY','ON_DUTY','EXCUSED')),
        marked_by    text REFERENCES users(id) ON DELETE SET NULL,
        source       text NOT NULL DEFAULT 'MANUAL'
                     CHECK (source IN ('MANUAL','BIOMETRIC','QR','RFID','BULK')),
        notes        text,
        created_at   timestamptz NOT NULL DEFAULT now(),
        UNIQUE (student_id, subject_id, class_date, period_no)
      );
      CREATE INDEX IF NOT EXISTS idx_att_student_date ON attendance(student_id, class_date);
      CREATE INDEX IF NOT EXISTS idx_att_subject_date ON attendance(subject_id, class_date);

      CREATE TABLE IF NOT EXISTS leaves (
        id                text PRIMARY KEY,
        student_id        text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        leave_type        text NOT NULL CHECK (leave_type IN
                          ('CASUAL','SICK','MEDICAL','ON_DUTY','COMPENSATORY',
                           'MATERNITY','PATERNITY','BEREAVEMENT','OTHER')),
        start_date        date NOT NULL,
        end_date          date NOT NULL,
        no_of_days        int NOT NULL CHECK (no_of_days > 0),
        reason            text NOT NULL,
        status            text NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
        has_medical_cert  boolean NOT NULL DEFAULT false,
        -- Snapshot of the projection shown to the student at apply time, so the
        -- decision they made is auditable even if policy later changes.
        impact_snapshot   jsonb,
        applied_at        timestamptz NOT NULL DEFAULT now(),
        decided_by        text REFERENCES users(id) ON DELETE SET NULL,
        decided_at        timestamptz,
        decision_note     text,
        CHECK (end_date >= start_date)
      );
      CREATE INDEX IF NOT EXISTS idx_leaves_student ON leaves(student_id, status);
      CREATE INDEX IF NOT EXISTS idx_leaves_range ON leaves(start_date, end_date);

      -- Audit trail of every state transition on a leave request.
      CREATE TABLE IF NOT EXISTS leave_events (
        id          text PRIMARY KEY,
        leave_id    text NOT NULL REFERENCES leaves(id) ON DELETE CASCADE,
        actor_id    text REFERENCES users(id) ON DELETE SET NULL,
        from_status text,
        to_status   text NOT NULL,
        note        text,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_leave_events ON leave_events(leave_id);

      -- Condonation (medical waiver) applied per student+semester, capped by the
      -- AICTE 10% rule. Stored explicitly so it is auditable.
      CREATE TABLE IF NOT EXISTS condonations (
        id             text PRIMARY KEY,
        student_id     text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        semester       int NOT NULL,
        attendance_pct numeric(5,2) NOT NULL,
        condoned_pct   numeric(5,2) NOT NULL CHECK (condoned_pct >= 0 AND condoned_pct <= 10),
        reason         text NOT NULL,
        approved_by    text REFERENCES users(id) ON DELETE SET NULL,
        approved_at    timestamptz NOT NULL DEFAULT now(),
        UNIQUE (student_id, semester)
      );
    `,
  },
  {
    name: "004_marks_cgpa_exams",
    sql: `
      CREATE TABLE IF NOT EXISTS marks (
        id              text PRIMARY KEY,
        student_id      text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject_id      text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        exam_type       text NOT NULL CHECK (exam_type IN
                        ('INTERNAL_1','INTERNAL_2','INTERNAL_3','MODEL','SEMESTER','PRACTICAL')),
        semester        int NOT NULL CHECK (semester > 0),
        internal_marks  numeric(6,2) NOT NULL DEFAULT 0 CHECK (internal_marks >= 0),
        external_marks  numeric(6,2) NOT NULL DEFAULT 0 CHECK (external_marks >= 0),
        internal_max    numeric(6,2) NOT NULL DEFAULT 40,
        external_max    numeric(6,2) NOT NULL DEFAULT 60,
        graded_by       text REFERENCES users(id) ON DELETE SET NULL,
        graded_at       timestamptz NOT NULL DEFAULT now(),
        published_at    timestamptz,
        UNIQUE (student_id, subject_id, exam_type, semester)
      );
      CREATE INDEX IF NOT EXISTS idx_marks_student_sem ON marks(student_id, semester);

      -- Semester result snapshot. SGPA/CGPA are stored (not just derived) so a
      -- published result is immutable and re-gradeable without rewriting
      -- history.
      CREATE TABLE IF NOT EXISTS cgpa_records (
        id               text PRIMARY KEY,
        student_id       text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        semester         int NOT NULL CHECK (semester > 0),
        total_credits    int NOT NULL,
        earned_credits   int NOT NULL,
        sgpa             numeric(4,2) NOT NULL,
        cgpa             numeric(4,2) NOT NULL,
        academic_year    text NOT NULL,
        published_at     timestamptz,
        created_at       timestamptz NOT NULL DEFAULT now(),
        UNIQUE (student_id, semester)
      );

      CREATE TABLE IF NOT EXISTS exam_registrations (
        id             text PRIMARY KEY,
        student_id     text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        subject_id     text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        semester       int NOT NULL,
        academic_year  text NOT NULL,
        attendance_pct_at_registration numeric(5,2) NOT NULL,
        status         text NOT NULL DEFAULT 'REGISTERED'
                       CHECK (status IN ('REGISTERED','BLOCKED','CLEARED','CANCELLED')),
        block_reason   text,
        created_at     timestamptz NOT NULL DEFAULT now(),
        UNIQUE (student_id, subject_id, semester, academic_year)
      );
    `,
  },
  {
    name: "005_notifications_audit",
    sql: `
      CREATE TABLE IF NOT EXISTS notifications (
        id          text PRIMARY KEY,
        user_id     text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type        text NOT NULL,
        severity    text NOT NULL DEFAULT 'INFO'
                    CHECK (severity IN ('INFO','SUCCESS','WARNING','CRITICAL')),
        title       text NOT NULL,
        body        text NOT NULL,
        link        text,
        channels    text[] NOT NULL DEFAULT ARRAY['IN_APP']::text[],
        is_read     boolean NOT NULL DEFAULT false,
        read_at     timestamptz,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_notif_user_time ON notifications(user_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS audit_log (
        id          text PRIMARY KEY,
        actor_id    text REFERENCES users(id) ON DELETE SET NULL,
        action      text NOT NULL,
        entity      text NOT NULL,
        entity_id   text NOT NULL,
        detail      jsonb,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity, entity_id);
      CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(created_at DESC);

      CREATE TABLE IF NOT EXISTS announcements (
        id          text PRIMARY KEY,
        title       text NOT NULL,
        body        text NOT NULL,
        audience    text NOT NULL DEFAULT 'ALL',
        created_by  text REFERENCES users(id) ON DELETE SET NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    name: "006_attendance_views",
    sql: `
      -- Canonical per-subject attendance rollup. Derived column
      -- effective_percentage applies approved condonation.
      CREATE OR REPLACE VIEW v_attendance_subject AS
      SELECT
        a.student_id,
        a.subject_id,
        COUNT(*)::int                                          AS held,
        COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::int AS attended,
        COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int        AS absent,
        COUNT(*) FILTER (WHERE a.status IN ('ON_DUTY','EXCUSED'))::int AS excused,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))
          / NULLIF(COUNT(*), 0), 2
        )::numeric(5,2)                                        AS percentage
      FROM attendance a
      GROUP BY a.student_id, a.subject_id;

      -- Student + subject + threshold + eligibility, the view the UI and the
      -- exam-eligibility gate both read.
      CREATE OR REPLACE VIEW v_attendance_status AS
      SELECT
        v.student_id,
        v.subject_id,
        s.code            AS subject_code,
        s.name            AS subject_name,
        s.credits,
        s.exam_eligibility_threshold,
        v.held,
        v.attended,
        v.absent,
        v.excused,
        v.percentage,
        COALESCE(c.condoned_pct, 0)::numeric(5,2) AS condoned_pct,
        ROUND(v.percentage + COALESCE(c.condoned_pct, 0), 2)::numeric(5,2)
          AS effective_percentage,
        (v.percentage + COALESCE(c.condoned_pct, 0))
          < s.exam_eligibility_threshold              AS is_below_threshold
      FROM v_attendance_subject v
      JOIN subjects s ON s.id = v.subject_id
      LEFT JOIN condonations c
        ON c.student_id = v.student_id AND c.semester = s.semester;
    `,
  },
  {
    // Coursework for the portal's LMS panel. Assignments hang off the real
    // `subjects` rows rather than a parallel course table, so a course in the
    // UI always corresponds to a subject that actually carries marks and
    // attendance in the database.
    name: "006_course_assignments",
    sql: `
      CREATE TABLE IF NOT EXISTS course_assignments (
        id          text PRIMARY KEY,
        subject_id  text NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
        title       text NOT NULL,
        description text,
        due_date    date NOT NULL,
        max_marks   int NOT NULL DEFAULT 100 CHECK (max_marks > 0),
        priority    text NOT NULL DEFAULT 'NORMAL'
                      CHECK (priority IN ('LOW','NORMAL','HIGH')),
        created_at  timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_assignments_due ON course_assignments(due_date);

      CREATE TABLE IF NOT EXISTS assignment_submissions (
        id            text PRIMARY KEY,
        assignment_id text NOT NULL REFERENCES course_assignments(id) ON DELETE CASCADE,
        student_id    text NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        status        text NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','SUBMITTED','GRADED','LATE')),
        score         int CHECK (score >= 0),
        submitted_at  timestamptz,
        UNIQUE (assignment_id, student_id)
      );
    `,
  },
];
