-- Migration to add student wellbeing tracking

CREATE TABLE IF NOT EXISTS student_wellbeing (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    stress_level INTEGER NOT NULL CHECK (stress_level >= 1 AND stress_level <= 5),
    mood VARCHAR(50),
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_wellbeing_student_id ON student_wellbeing(student_id);
CREATE INDEX IF NOT EXISTS idx_student_wellbeing_created_at ON student_wellbeing(created_at DESC);
