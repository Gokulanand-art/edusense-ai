CREATE TABLE IF NOT EXISTS institutions (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    code VARCHAR(50) NOT NULL,
    subdomain VARCHAR(100),
    plan_name VARCHAR(50) NOT NULL DEFAULT 'starter',
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE institutions
    ADD COLUMN IF NOT EXISTS name VARCHAR(150),
    ADD COLUMN IF NOT EXISTS code VARCHAR(50),
    ADD COLUMN IF NOT EXISTS subdomain VARCHAR(100),
    ADD COLUMN IF NOT EXISTS plan_name VARCHAR(50) NOT NULL DEFAULT 'starter',
    ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX IF NOT EXISTS institutions_code_upper_unique_idx
    ON institutions (UPPER(code));

CREATE UNIQUE INDEX IF NOT EXISTS institutions_subdomain_lower_unique_idx
    ON institutions (LOWER(subdomain))
    WHERE subdomain IS NOT NULL AND TRIM(subdomain) <> '';

INSERT INTO institutions (name, code, subdomain, plan_name, status, is_default)
VALUES ('Default Campus', 'DEFAULT', 'default', 'starter', 'active', TRUE)
ON CONFLICT DO NOTHING;

UPDATE institutions
SET is_default = TRUE
WHERE id = (
    SELECT id
    FROM institutions
    ORDER BY is_default DESC, id ASC
    LIMIT 1
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE departments ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_id INTEGER;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects') THEN
        ALTER TABLE subjects ADD COLUMN IF NOT EXISTS institution_id INTEGER;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notices') THEN
        ALTER TABLE notices ADD COLUMN IF NOT EXISTS institution_id INTEGER;
    END IF;
END
$$;

DO $$
DECLARE
    default_institution_id INTEGER;
BEGIN
    SELECT id INTO default_institution_id
    FROM institutions
    ORDER BY is_default DESC, id ASC
    LIMIT 1;

    UPDATE users SET institution_id = default_institution_id WHERE institution_id IS NULL;
    UPDATE departments SET institution_id = default_institution_id WHERE institution_id IS NULL;
    UPDATE students SET institution_id = default_institution_id WHERE institution_id IS NULL;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects') THEN
        UPDATE subjects SET institution_id = default_institution_id WHERE institution_id IS NULL;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notices') THEN
        UPDATE notices SET institution_id = default_institution_id WHERE institution_id IS NULL;
    END IF;
END
$$;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_institution_id_fkey;
ALTER TABLE departments DROP CONSTRAINT IF EXISTS departments_institution_id_fkey;
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_institution_id_fkey;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects') THEN
        ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_institution_id_fkey;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notices') THEN
        ALTER TABLE notices DROP CONSTRAINT IF EXISTS notices_institution_id_fkey;
    END IF;
END
$$;

DO $$
BEGIN
    ALTER TABLE users
        ADD CONSTRAINT users_institution_id_fkey
        FOREIGN KEY (institution_id) REFERENCES institutions(id)
        ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE departments
        ADD CONSTRAINT departments_institution_id_fkey
        FOREIGN KEY (institution_id) REFERENCES institutions(id)
        ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE students
        ADD CONSTRAINT students_institution_id_fkey
        FOREIGN KEY (institution_id) REFERENCES institutions(id)
        ON DELETE RESTRICT;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects') THEN
        BEGIN
            ALTER TABLE subjects
                ADD CONSTRAINT subjects_institution_id_fkey
                FOREIGN KEY (institution_id) REFERENCES institutions(id)
                ON DELETE RESTRICT;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notices') THEN
        BEGIN
            ALTER TABLE notices
                ADD CONSTRAINT notices_institution_id_fkey
                FOREIGN KEY (institution_id) REFERENCES institutions(id)
                ON DELETE CASCADE;
        EXCEPTION
            WHEN duplicate_object THEN NULL;
        END;
    END IF;
END
$$;

DROP INDEX IF EXISTS users_email_lower_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS users_institution_email_unique_idx
    ON users (institution_id, LOWER(email));

DROP INDEX IF EXISTS students_email_lower_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS students_institution_email_unique_idx
    ON students (institution_id, LOWER(email))
    WHERE email IS NOT NULL AND TRIM(email) <> '';

DROP INDEX IF EXISTS students_roll_number_upper_unique_idx;
CREATE UNIQUE INDEX IF NOT EXISTS students_institution_roll_unique_idx
    ON students (institution_id, UPPER(TRIM(roll_number)))
    WHERE roll_number IS NOT NULL AND TRIM(roll_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS departments_institution_name_unique_idx
    ON departments (institution_id, LOWER(name));

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects') THEN
        CREATE UNIQUE INDEX IF NOT EXISTS subjects_institution_code_unique_idx
            ON subjects (institution_id, UPPER(code));
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS users_institution_id_idx ON users (institution_id);
CREATE INDEX IF NOT EXISTS students_institution_id_idx ON students (institution_id);
CREATE INDEX IF NOT EXISTS departments_institution_id_idx ON departments (institution_id);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subjects') THEN
        CREATE INDEX IF NOT EXISTS subjects_institution_id_idx ON subjects (institution_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notices') THEN
        CREATE INDEX IF NOT EXISTS notices_institution_id_idx ON notices (institution_id);
    END IF;
END
$$;

WITH admin_candidates AS (
    SELECT u.id
    FROM users u
    JOIN roles r ON r.id = u.role_id
    WHERE LOWER(r.role_name) = 'admin'
    ORDER BY u.id ASC
    LIMIT 1
)
UPDATE users
SET is_super_admin = TRUE
WHERE id IN (SELECT id FROM admin_candidates);
