-- Migration 013: Media Upload & File Management
-- Adds support for file uploads, storage tracking, and public file sharing

CREATE TABLE IF NOT EXISTS media (
    id SERIAL PRIMARY KEY,
    file_id UUID UNIQUE NOT NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50),
    file_size INTEGER,
    mime_type VARCHAR(100),
    upload_path TEXT,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT media_user_check CHECK (student_id IS NOT NULL OR faculty_id IS NOT NULL)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_media_file_id ON media(file_id);
CREATE INDEX IF NOT EXISTS idx_media_student_id ON media(student_id);
CREATE INDEX IF NOT EXISTS idx_media_faculty_id ON media(faculty_id);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_is_public ON media(is_public);

-- Create export tracking table
CREATE TABLE IF NOT EXISTS data_exports (
    id SERIAL PRIMARY KEY,
    export_id UUID UNIQUE NOT NULL,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    faculty_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    export_type VARCHAR(50) NOT NULL, -- 'csv', 'json', 'pdf', 'xlsx'
    data_type VARCHAR(50) NOT NULL, -- 'marks', 'attendance', 'skills', 'goals', 'performance'
    file_path TEXT,
    record_count INTEGER DEFAULT 0,
    file_size INTEGER,
    status VARCHAR(20) DEFAULT 'completed', -- 'processing', 'completed', 'failed'
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for export tracking
CREATE INDEX IF NOT EXISTS idx_exports_student_id ON data_exports(student_id);
CREATE INDEX IF NOT EXISTS idx_exports_faculty_id ON data_exports(faculty_id);
CREATE INDEX IF NOT EXISTS idx_exports_export_id ON data_exports(export_id);
CREATE INDEX IF NOT EXISTS idx_exports_created_at ON data_exports(created_at DESC);

-- Create file sharing table for collaborative features
CREATE TABLE IF NOT EXISTS file_sharing (
    id SERIAL PRIMARY KEY,
    media_id INTEGER REFERENCES media(id) ON DELETE CASCADE,
    shared_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    shared_with_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    permission_type VARCHAR(20) DEFAULT 'view', -- 'view', 'download', 'comment'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    UNIQUE(media_id, shared_with_user_id)
);

CREATE INDEX IF NOT EXISTS idx_file_sharing_media_id ON file_sharing(media_id);
CREATE INDEX IF NOT EXISTS idx_file_sharing_shared_with ON file_sharing(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_file_sharing_created_at ON file_sharing(created_at DESC);
