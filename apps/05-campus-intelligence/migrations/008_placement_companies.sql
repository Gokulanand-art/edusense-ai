-- Migration: Placement Companies & Company Matching

CREATE TABLE IF NOT EXISTS placement_companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    min_cgpa DECIMAL(3, 2) NOT NULL,
    min_attendance INTEGER NOT NULL DEFAULT 75,
    min_mock_score INTEGER NOT NULL DEFAULT 60,
    min_marks_percentage DECIMAL(5, 2) NOT NULL DEFAULT 60,
    package_lpa DECIMAL(4, 2) NOT NULL,
    sector VARCHAR(100),
    required_skills TEXT[],  -- PostgreSQL array: '{"Python","DSA"}'
    description TEXT,
    logo_url VARCHAR(500),
    website_url VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_placement_companies_name ON placement_companies(name);
CREATE INDEX IF NOT EXISTS idx_placement_companies_min_cgpa ON placement_companies(min_cgpa);

-- Table to track student applications to companies (optional, for future)
CREATE TABLE IF NOT EXISTS student_company_applications (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    company_id INTEGER NOT NULL REFERENCES placement_companies(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'interested',  -- interested, applied, interview, selected, rejected
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_company_student_id ON student_company_applications(student_id);
CREATE INDEX IF NOT EXISTS idx_student_company_company_id ON student_company_applications(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_company_unique ON student_company_applications(student_id, company_id);
