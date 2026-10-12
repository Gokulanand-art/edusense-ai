-- Migration 006: Performance indexes
-- Adds missing indexes for frequently-queried columns.
-- All CREATE INDEX statements use IF NOT EXISTS to be idempotent.

-- students table
CREATE INDEX IF NOT EXISTS idx_students_user_id   ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_students_email      ON students(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);

-- users table
CREATE INDEX IF NOT EXISTS idx_users_email   ON users(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);

-- attendance: most queries filter by student_id + subject_id
CREATE INDEX IF NOT EXISTS idx_attendance_student_id ON attendance(student_id);
CREATE INDEX IF NOT EXISTS idx_attendance_subject_id ON attendance(subject_id);

-- marks
CREATE INDEX IF NOT EXISTS idx_marks_student_id ON marks(student_id);
CREATE INDEX IF NOT EXISTS idx_marks_subject_id ON marks(subject_id);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read   ON notifications(is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- jwt_blacklist — covered by its PK on jti, no extra index needed
