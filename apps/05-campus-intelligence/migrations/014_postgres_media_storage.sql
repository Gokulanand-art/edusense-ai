-- Migration 014: Store uploaded media bytes in PostgreSQL
-- Keeps existing media metadata while moving durable storage to media.file_data.

ALTER TABLE media ADD COLUMN IF NOT EXISTS uploaded_by_user_id INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS uploader_role VARCHAR(20);
ALTER TABLE media ADD COLUMN IF NOT EXISTS institution_id INTEGER;
ALTER TABLE media ADD COLUMN IF NOT EXISTS file_data BYTEA;
ALTER TABLE media ADD COLUMN IF NOT EXISTS content_sha256 CHAR(64);
ALTER TABLE media ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE media ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
ALTER TABLE media ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_user_check;

UPDATE media m
SET uploaded_by_user_id = COALESCE(m.uploaded_by_user_id, s.user_id),
    institution_id = COALESCE(m.institution_id, s.institution_id),
    uploader_role = COALESCE(m.uploader_role, 'student')
FROM students s
WHERE m.student_id = s.id;

UPDATE media m
SET uploaded_by_user_id = COALESCE(m.uploaded_by_user_id, m.faculty_id),
    institution_id = COALESCE(m.institution_id, u.institution_id),
    uploader_role = COALESCE(m.uploader_role, 'faculty')
FROM users u
WHERE m.faculty_id = u.id;

ALTER TABLE media DROP CONSTRAINT IF EXISTS media_uploaded_by_user_id_fkey;
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_institution_id_fkey;

DO $$
BEGIN
    ALTER TABLE media
        ADD CONSTRAINT media_uploaded_by_user_id_fkey
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
    ALTER TABLE media
        ADD CONSTRAINT media_institution_id_fkey
        FOREIGN KEY (institution_id) REFERENCES institutions(id)
        ON DELETE SET NULL;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_media_uploaded_by_user_id ON media(uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS idx_media_institution_id ON media(institution_id);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_is_public ON media(is_public);
