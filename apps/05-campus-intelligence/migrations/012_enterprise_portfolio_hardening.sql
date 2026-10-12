CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    institution_id INTEGER REFERENCES institutions(id) ON DELETE SET NULL,
    action VARCHAR(120) NOT NULL,
    entity_type VARCHAR(80),
    entity_id VARCHAR(120),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS audit_logs_institution_created_idx
    ON audit_logs (institution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_actor_created_idx
    ON audit_logs (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_logs_action_idx
    ON audit_logs (action);
