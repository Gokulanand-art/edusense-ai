-- This migration hardens the schema by ensuring strict foreign keys and cascading behavior.

-- 1. Subject to Department mapping
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'subjects') THEN
        ALTER TABLE subjects DROP CONSTRAINT IF EXISTS subjects_department_fkey;
        ALTER TABLE subjects 
        ADD CONSTRAINT subjects_department_fkey 
        FOREIGN KEY (department) REFERENCES departments(name) 
        ON UPDATE CASCADE ON DELETE RESTRICT;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Marks references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'marks') THEN
        ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_student_id_fkey;
        ALTER TABLE marks DROP CONSTRAINT IF EXISTS marks_subject_id_fkey;
        
        ALTER TABLE marks 
        ADD CONSTRAINT marks_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) 
        ON DELETE CASCADE;

        ALTER TABLE marks 
        ADD CONSTRAINT marks_subject_id_fkey 
        FOREIGN KEY (subject_id) REFERENCES subjects(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Attendance references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'attendance') THEN
        ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_student_id_fkey;
        ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_subject_id_fkey;
        
        ALTER TABLE attendance 
        ADD CONSTRAINT attendance_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) 
        ON DELETE CASCADE;

        ALTER TABLE attendance 
        ADD CONSTRAINT attendance_subject_id_fkey 
        FOREIGN KEY (subject_id) REFERENCES subjects(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. Mock Tests references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'mock_tests') THEN
        ALTER TABLE mock_tests DROP CONSTRAINT IF EXISTS mock_tests_student_id_fkey;
        ALTER TABLE mock_tests 
        ADD CONSTRAINT mock_tests_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. Student Skills references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_skills') THEN
        ALTER TABLE student_skills DROP CONSTRAINT IF EXISTS student_skills_student_id_fkey;
        ALTER TABLE student_skills DROP CONSTRAINT IF EXISTS student_skills_skill_id_fkey;
        
        ALTER TABLE student_skills 
        ADD CONSTRAINT student_skills_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) 
        ON DELETE CASCADE;

        ALTER TABLE student_skills 
        ADD CONSTRAINT student_skills_skill_id_fkey 
        FOREIGN KEY (skill_id) REFERENCES skills(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 6. Student Goals references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_goals') THEN
        ALTER TABLE student_goals DROP CONSTRAINT IF EXISTS student_goals_student_id_fkey;
        ALTER TABLE student_goals 
        ADD CONSTRAINT student_goals_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. Goal Milestones references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goal_milestones') THEN
        ALTER TABLE goal_milestones DROP CONSTRAINT IF EXISTS goal_milestones_goal_id_fkey;
        ALTER TABLE goal_milestones 
        ADD CONSTRAINT goal_milestones_goal_id_fkey 
        FOREIGN KEY (goal_id) REFERENCES student_goals(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 8. Student Badges references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_badges') THEN
        ALTER TABLE student_badges DROP CONSTRAINT IF EXISTS student_badges_student_id_fkey;
        ALTER TABLE student_badges 
        ADD CONSTRAINT student_badges_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES students(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 9. Notifications references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_user_id_fkey;
        ALTER TABLE notifications 
        ADD CONSTRAINT notifications_user_id_fkey 
        FOREIGN KEY (user_id) REFERENCES users(id) 
        ON DELETE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 10. Student Interventions references
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'student_interventions') THEN
        -- student_id FK
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_interventions' AND column_name = 'student_id') THEN
            ALTER TABLE student_interventions DROP CONSTRAINT IF EXISTS student_interventions_student_id_fkey;
            ALTER TABLE student_interventions 
            ADD CONSTRAINT student_interventions_student_id_fkey 
            FOREIGN KEY (student_id) REFERENCES students(id) 
            ON DELETE CASCADE;
        END IF;

        -- faculty_id FK (only if column exists)
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_interventions' AND column_name = 'faculty_id') THEN
            ALTER TABLE student_interventions DROP CONSTRAINT IF EXISTS student_interventions_faculty_id_fkey;
            ALTER TABLE student_interventions 
            ADD CONSTRAINT student_interventions_faculty_id_fkey 
            FOREIGN KEY (faculty_id) REFERENCES users(id) 
            ON DELETE SET NULL;
        END IF;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
