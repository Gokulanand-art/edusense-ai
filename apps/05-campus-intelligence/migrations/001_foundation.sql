CREATE TABLE IF NOT EXISTS departments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE departments
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(100) UNIQUE,
    roll_number VARCHAR(50),
    department VARCHAR(100),
    user_id INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE students
    ADD COLUMN IF NOT EXISTS name VARCHAR(100),
    ADD COLUMN IF NOT EXISTS email VARCHAR(100),
    ADD COLUMN IF NOT EXISTS roll_number VARCHAR(50),
    ADD COLUMN IF NOT EXISTS department VARCHAR(100),
    ADD COLUMN IF NOT EXISTS user_id INTEGER,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE students
SET
    department = NULLIF(TRIM(department), ''),
    roll_number = NULLIF(UPPER(TRIM(roll_number)), ''),
    name = NULLIF(TRIM(name), '');

INSERT INTO departments (name)
SELECT DISTINCT TRIM(department)
FROM students
WHERE department IS NOT NULL AND TRIM(department) <> ''
ON CONFLICT (name) DO NOTHING;

ALTER TABLE students DROP CONSTRAINT IF EXISTS students_user_id_fkey;
ALTER TABLE students DROP CONSTRAINT IF EXISTS fk_user;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_department_fkey;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'users'
    ) THEN
        ALTER TABLE students
        ADD CONSTRAINT students_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE students
    ADD CONSTRAINT students_department_fkey
    FOREIGN KEY (department) REFERENCES departments(name)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS students_set_updated_at ON students;
CREATE TRIGGER students_set_updated_at
BEFORE UPDATE ON students
FOR EACH ROW
EXECUTE FUNCTION set_row_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS students_email_lower_unique_idx
    ON students (LOWER(email))
    WHERE email IS NOT NULL AND TRIM(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS students_roll_number_upper_unique_idx
    ON students (UPPER(TRIM(roll_number)))
    WHERE roll_number IS NOT NULL AND TRIM(roll_number) <> '';

CREATE INDEX IF NOT EXISTS students_user_id_idx ON students (user_id);
CREATE INDEX IF NOT EXISTS students_department_idx ON students (department);
