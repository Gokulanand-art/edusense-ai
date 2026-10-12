-- Migration: AI conversation history and rate limiting

CREATE TABLE IF NOT EXISTS ai_conversations (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    role VARCHAR(10) NOT NULL,  -- 'student' or 'assistant'
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_student_id ON ai_conversations(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_created_at ON ai_conversations(created_at DESC);

-- Rate limiting: track requests per student per day
CREATE TABLE IF NOT EXISTS ai_rate_limits (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    request_count INTEGER DEFAULT 0,
    reset_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_student_id ON ai_rate_limits(student_id);
CREATE INDEX IF NOT EXISTS idx_ai_rate_limits_reset_at ON ai_rate_limits(reset_at);
