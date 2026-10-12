DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notices') THEN
        ALTER TABLE notices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE notices ADD COLUMN IF NOT EXISTS publish_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        ALTER TABLE notices ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL;

        UPDATE notices
        SET publish_at = COALESCE(publish_at, created_at, CURRENT_TIMESTAMP)
        WHERE publish_at IS NULL;

        CREATE INDEX IF NOT EXISTS notices_institution_publish_idx
            ON notices (institution_id, publish_at DESC);

        CREATE INDEX IF NOT EXISTS notices_institution_expiry_idx
            ON notices (institution_id, expires_at);
    END IF;
END
$$;
