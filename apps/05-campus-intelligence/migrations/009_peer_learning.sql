-- SPRINT 3: Peer Learning Feed
-- Migration 009: Core tables for peer achievements, skills, study groups, and preferences

BEGIN;

-- ===================================================================
-- 1. PEER ACHIEVEMENTS TABLE
-- Records student achievements (placements, skill badges, goals)
-- ===================================================================
CREATE TABLE IF NOT EXISTS peer_achievements (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    achievement_type VARCHAR(50) NOT NULL,
    -- Types: 'placement' (company match), 'skill' (learned skill), 
    --        'badge' (milestone), 'goal' (completed goal)
    achievement_data JSONB NOT NULL,
    -- For placement: {company, date, score, package, sector}
    -- For skill: {skill_name, proficiency, resource_url}
    -- For badge: {badge_name, criteria, value}
    -- For goal: {goal_title, target_date, progress}
    is_anonymous BOOLEAN DEFAULT TRUE,
    -- If true, show as "Student from CS-A" instead of full name
    consent_given BOOLEAN DEFAULT FALSE,
    -- Both student creating and student viewing must consent
    visibility BOOLEAN DEFAULT TRUE,
    -- Student can hide an achievement
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_achievement_type CHECK (
        achievement_type IN ('placement', 'skill', 'badge', 'goal')
    )
);

CREATE INDEX IF NOT EXISTS idx_peer_achievements_student_created 
    ON peer_achievements(student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_peer_achievements_type_created 
    ON peer_achievements(achievement_type, created_at DESC);

-- ===================================================================
-- 2. PEER SKILLS TABLE
-- Skills learned by students, shareable with recommendations
-- ===================================================================
CREATE TABLE IF NOT EXISTS peer_skills (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    skill_name VARCHAR(100) NOT NULL,
    proficiency_level INTEGER DEFAULT 1,
    -- 1=Beginner, 2=Intermediate, 3=Advanced, 4=Expert, 5=Mentor
    date_learned TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    shared BOOLEAN DEFAULT FALSE,
    -- If true, visible in peer marketplace
    resource_link VARCHAR(500),
    -- URL to learning material (course, tutorial, etc.)
    recommendation_count INTEGER DEFAULT 0,
    -- How many peers recommended this skill
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_proficiency CHECK (proficiency_level BETWEEN 1 AND 5),
    CONSTRAINT unique_skill_per_student UNIQUE(student_id, skill_name)
);

CREATE INDEX IF NOT EXISTS idx_peer_skills_shared_proficiency 
    ON peer_skills(shared, proficiency_level DESC);
CREATE INDEX IF NOT EXISTS idx_peer_skills_student_skill 
    ON peer_skills(student_id, skill_name);

-- ===================================================================
-- 3. STUDY GROUPS TABLE
-- Goal-based learning circles (2-4 students)
-- ===================================================================
CREATE TABLE IF NOT EXISTS study_groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    goal VARCHAR(300) NOT NULL,
    -- e.g., "AWS Certification by Sept 30", "GATE Prep 2024"
    created_by INTEGER NOT NULL REFERENCES students(id) ON DELETE SET NULL,
    target_date DATE,
    status VARCHAR(50) DEFAULT 'active',
    -- 'active', 'completed', 'paused', 'disbanded'
    max_members INTEGER DEFAULT 4,
    current_member_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_status CHECK (status IN ('active', 'completed', 'paused', 'disbanded')),
    CONSTRAINT valid_max_members CHECK (max_members BETWEEN 2 AND 10),
    CONSTRAINT future_target_date CHECK (target_date IS NULL OR target_date > CURRENT_DATE)
);

CREATE INDEX IF NOT EXISTS idx_study_groups_status_created 
    ON study_groups(status, created_at DESC);

-- ===================================================================
-- 4. STUDY GROUP MEMBERS TABLE
-- Tracks which students are in which groups
-- ===================================================================
CREATE TABLE IF NOT EXISTS study_group_members (
    id SERIAL PRIMARY KEY,
    study_group_id INTEGER NOT NULL REFERENCES study_groups(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    role VARCHAR(50) DEFAULT 'member',
    -- 'creator', 'member'
    contribution_score INTEGER DEFAULT 0,
    -- Gamified score for participation (posts, resources, etc.)
    
    CONSTRAINT valid_role CHECK (role IN ('creator', 'member')),
    CONSTRAINT unique_member_per_group UNIQUE(study_group_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_study_group_members_student 
    ON study_group_members(student_id, joined_at DESC);

-- ===================================================================
-- 5. PEER FEED PREFERENCES TABLE
-- Student privacy and notification settings
-- ===================================================================
CREATE TABLE IF NOT EXISTS peer_feed_preferences (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    show_placements BOOLEAN DEFAULT TRUE,
    -- Can peers see when I get placed?
    show_skills BOOLEAN DEFAULT TRUE,
    -- Can peers see my learned skills?
    show_study_groups BOOLEAN DEFAULT TRUE,
    -- Can peers see my study group participation?
    anonymous_mode BOOLEAN DEFAULT TRUE,
    -- Show as "Student from CS-A" instead of name?
    email_on_peer_achievement BOOLEAN DEFAULT FALSE,
    -- Notify when a peer gets placed?
    email_on_study_group_invite BOOLEAN DEFAULT TRUE,
    -- Notify on study group invitation?
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_peer_feed_prefs_student ON peer_feed_preferences(student_id);

-- ===================================================================
-- 6. PEER SKILL RECOMMENDATIONS TABLE
-- When student recommends a peer's skill to another peer
-- ===================================================================
CREATE TABLE IF NOT EXISTS peer_skill_recommendations (
    id SERIAL PRIMARY KEY,
    skill_id INTEGER NOT NULL REFERENCES peer_skills(id) ON DELETE CASCADE,
    recommended_by INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    recommended_to INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_recommendation UNIQUE(skill_id, recommended_by, recommended_to)
);

-- ===================================================================
-- INDEXES FOR COMMON QUERIES
-- ===================================================================

-- Fast feed queries (peer achievements ordered by date)
CREATE INDEX IF NOT EXISTS idx_peer_feed_combined ON peer_achievements(created_at DESC);

-- Fast study group discovery
CREATE INDEX IF NOT EXISTS idx_study_groups_discovery ON study_groups(status, target_date);

-- Fast "Find peers in my major" queries
CREATE INDEX IF NOT EXISTS idx_peer_skills_student_created ON peer_skills(student_id, created_at DESC);

-- ===================================================================
-- INITIAL DATA (Optional - Seeding)
-- ===================================================================

-- Seed default preferences for existing students (non-destructive)
INSERT INTO peer_feed_preferences (student_id)
SELECT id FROM students 
WHERE id NOT IN (SELECT student_id FROM peer_feed_preferences)
ON CONFLICT (student_id) DO NOTHING;

COMMIT;
