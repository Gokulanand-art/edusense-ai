"""
SPRINT 3: Peer Learning Feed - Comprehensive Test Suite

Tests for:
- Peer achievements (placement, skill, badge, goal)
- Peer feed (with privacy/anonymity)
- Study groups
- Peer preferences and privacy
- Trending skills
"""

import pytest
import json
from database import get_db_connection
from services.peer_learning_service import (
    ensure_peer_tables_consistency,
    record_peer_achievement,
    get_peer_feed_for_student,
    update_peer_preferences,
    get_peer_preferences,
    add_peer_skill,
    get_trending_skills,
    create_study_group,
    join_study_group,
    get_student_study_groups
)


class TestPeerAchievements:
    """Test peer achievement recording and retrieval."""
    
    def setup_method(self):
        """Setup test data before each test."""
        self.student_ids = []
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Create test department
                cur.execute("""
                    INSERT INTO departments (name) VALUES ('Computer Science')
                    ON CONFLICT (name) DO NOTHING
                """)
                
                # Create test users
                for i in range(1, 4):
                    email = f'test_student{i}@test.com'
                    cur.execute("""
                        INSERT INTO users (name, email, password, role)
                        VALUES (%s, %s, %s, 'student')
                        ON CONFLICT (email) DO NOTHING
                    """, (f'Test Student {i}', email, 'hashed_password'))
                    
                    # Get user ID
                    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                    user_row = cur.fetchone()
                    if user_row:
                        user_id = user_row[0]
                        
                        # Create student
                        cur.execute("""
                            INSERT INTO students (user_id, name, email, department)
                            VALUES (%s, %s, %s, 'Computer Science')
                            ON CONFLICT DO NOTHING
                        """, (user_id, f'Test Student {i}', email))
                        
                        # Get student ID
                        cur.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
                        student_row = cur.fetchone()
                        if student_row:
                            student_id = student_row[0]
                            self.student_ids.append(student_id)
                            
                            # Create default preferences
                            cur.execute("""
                                INSERT INTO peer_feed_preferences (student_id)
                                VALUES (%s)
                                ON CONFLICT (student_id) DO NOTHING
                            """, (student_id,))
                
            conn.commit()
    
    def teardown_method(self):
        """Clean up test data after each test."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Delete in reverse order of dependencies
                for i in range(1, 4):
                    email = f'test_student{i}@test.com'
                    cur.execute("DELETE FROM peer_achievements WHERE student_id IN (SELECT id FROM students WHERE email = %s)", (email,))
                    cur.execute("DELETE FROM peer_skills WHERE student_id IN (SELECT id FROM students WHERE email = %s)", (email,))
                    cur.execute("DELETE FROM peer_feed_preferences WHERE student_id IN (SELECT id FROM students WHERE email = %s)", (email,))
                    cur.execute("DELETE FROM students WHERE email = %s", (email,))
                    cur.execute("DELETE FROM users WHERE email = %s", (email,))
            conn.commit()
    
    def test_ensure_peer_tables(self):
        """Test that peer tables are properly verified."""
        result = ensure_peer_tables_consistency()
        assert result is True, "Peer tables should exist"
    
    def test_record_placement_achievement(self):
        """Test recording a placement achievement."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        achievement_data = {
            'company': 'Infosys',
            'date': '2024-03-15',
            'score': 78.5,
            'package': 4.5,
            'sector': 'IT Services'
        }
        
        achievement_id = record_peer_achievement(
            student_id=self.student_ids[0],
            achievement_type='placement',
            achievement_data=achievement_data,
            is_anonymous=True,
            consent_given=True
        )
        
        assert achievement_id is not None, "Achievement should be created"
        
        # Verify it was stored
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT achievement_type, achievement_data, is_anonymous, consent_given
                    FROM peer_achievements WHERE id = %s
                """, (achievement_id,))
                
                result = cur.fetchone()
                assert result is not None
                assert result[0] == 'placement'
                assert result[2] is True  # is_anonymous
                assert result[3] is True  # consent_given
    
    def test_record_skill_achievement(self):
        """Test recording a skill achievement."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        achievement_data = {
            'skill_name': 'Python',
            'proficiency': 4,
            'resource_url': 'https://python.org'
        }
        
        achievement_id = record_peer_achievement(
            student_id=self.student_ids[0],
            achievement_type='skill',
            achievement_data=achievement_data
        )
        
        assert achievement_id is not None
    
    def test_record_invalid_achievement_type(self):
        """Test that invalid achievement type is rejected."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        achievement_id = record_peer_achievement(
            student_id=self.student_ids[0],
            achievement_type='invalid',
            achievement_data={'test': 'data'}
        )
        
        assert achievement_id is None, "Invalid achievement type should return None"
    
    def test_record_achievement_invalid_student(self):
        """Test that invalid student ID is rejected."""
        achievement_id = record_peer_achievement(
            student_id=9999,
            achievement_type='placement',
            achievement_data={'company': 'TCS'}
        )
        
        assert achievement_id is None, "Invalid student should return None"


class TestPeerFeed:
    """Test peer feed generation and privacy controls."""
    
    def setup_method(self):
        """Setup test data."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Create test department
                cur.execute("""
                    INSERT INTO departments (name) VALUES ('Computer Science')
                    ON CONFLICT (name) DO NOTHING
                """)
                
                # Create test users first
                cur.execute("""
                    INSERT INTO users (name, email, password, role)
                    VALUES 
                        ('Alice', 'alice@test.com', 'hash1', 'student'),
                        ('Bob', 'bob@test.com', 'hash2', 'student'),
                        ('Carol', 'carol@test.com', 'hash3', 'student'),
                        ('Dave', 'dave@test.com', 'hash4', 'student')
                    ON CONFLICT (email) DO NOTHING
                """)
                
                # Get the created user IDs
                cur.execute("SELECT id FROM users WHERE email IN ('alice@test.com', 'bob@test.com', 'carol@test.com', 'dave@test.com') ORDER BY email")
                user_ids = [row[0] for row in cur.fetchall()]
                
                # Create test students with the user IDs
                if len(user_ids) >= 4:
                    cur.execute(f"""
                        INSERT INTO students (user_id, name, email, department)
                        VALUES 
                            ({user_ids[0]}, 'Alice', 'alice@test.com', 'Computer Science'),
                            ({user_ids[1]}, 'Bob', 'bob@test.com', 'Computer Science'),
                            ({user_ids[2]}, 'Carol', 'carol@test.com', 'Computer Science'),
                            ({user_ids[3]}, 'Dave', 'dave@test.com', 'Computer Science')
                        ON CONFLICT DO NOTHING
                    """)
                    
                    # Create preferences
                    cur.execute(f"""
                        INSERT INTO peer_feed_preferences (student_id, anonymous_mode, show_placements)
                        SELECT id, true, true FROM students WHERE email = 'alice@test.com'
                        ON CONFLICT (student_id) DO NOTHING
                    """)
                    cur.execute(f"""
                        INSERT INTO peer_feed_preferences (student_id, anonymous_mode, show_placements)
                        SELECT id, false, true FROM students WHERE email = 'bob@test.com'
                        ON CONFLICT (student_id) DO NOTHING
                    """)
                    cur.execute(f"""
                        INSERT INTO peer_feed_preferences (student_id, anonymous_mode, show_placements)
                        SELECT id, true, false FROM students WHERE email = 'carol@test.com'
                        ON CONFLICT (student_id) DO NOTHING
                    """)
                    cur.execute(f"""
                        INSERT INTO peer_feed_preferences (student_id, anonymous_mode, show_placements)
                        SELECT id, false, false FROM students WHERE email = 'dave@test.com'
                        ON CONFLICT (student_id) DO NOTHING
                    """)
                    
                    # Add achievements
                    companies = ['TCS', 'Infosys', 'Wipro']
                    for i, company in enumerate(companies, start=1):
                        if i < len(user_ids):
                            # Get student ID for this user
                            cur.execute(f"SELECT id FROM students WHERE user_id = {user_ids[i]}")
                            student_row = cur.fetchone()
                            if student_row:
                                student_id = student_row[0]
                                cur.execute("""
                                    INSERT INTO peer_achievements 
                                    (student_id, achievement_type, achievement_data, is_anonymous, consent_given, visibility)
                                    VALUES (%s, 'placement', %s, true, true, true)
                                """, (student_id, json.dumps({'company': company, 'package': 3.5 + i*0.5})))
                
            conn.commit()
    
    def teardown_method(self):
        """Clean up."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM peer_achievements WHERE student_id IN (SELECT id FROM students WHERE email IN ('alice@test.com', 'bob@test.com', 'carol@test.com', 'dave@test.com'))")
                cur.execute("DELETE FROM peer_feed_preferences WHERE student_id IN (SELECT id FROM students WHERE email IN ('alice@test.com', 'bob@test.com', 'carol@test.com', 'dave@test.com'))")
                cur.execute("DELETE FROM students WHERE email IN ('alice@test.com', 'bob@test.com', 'carol@test.com', 'dave@test.com')")
                cur.execute("DELETE FROM users WHERE email IN ('alice@test.com', 'bob@test.com', 'carol@test.com', 'dave@test.com')")
            conn.commit()
    
    def test_get_peer_feed_basic(self):
        """Test getting peer feed for a student."""
        feed_items, total_count = get_peer_feed_for_student(student_id=1)
        
        assert total_count >= 0, "Feed should return count"
        assert isinstance(feed_items, list), "Feed should be a list"
    
    def test_get_peer_feed_pagination(self):
        """Test feed pagination."""
        feed_items_page1, total1 = get_peer_feed_for_student(
            student_id=1, limit=1, offset=0
        )
        feed_items_page2, total2 = get_peer_feed_for_student(
            student_id=1, limit=1, offset=1
        )
        
        assert total1 == total2, "Total count should be same"
        assert len(feed_items_page1) <= 1, "Pagination should respect limit"
    
    def test_get_peer_feed_filter_by_type(self):
        """Test filtering feed by achievement type."""
        feed_items, total = get_peer_feed_for_student(
            student_id=1,
            achievement_types=['placement']
        )
        
        # All items should be placements
        for item in feed_items:
            assert item['achievement_type'] == 'placement'


class TestPeerPreferences:
    """Test privacy and notification preferences."""
    
    def setup_method(self):
        """Setup test data."""
        self.student_id = None
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO departments (name) VALUES ('CS')
                    ON CONFLICT (name) DO NOTHING
                """)
                
                # Create user first
                cur.execute("""
                    INSERT INTO users (name, email, password, role)
                    VALUES ('Test Student', 'pref_test@test.com', 'hash', 'student')
                    ON CONFLICT (email) DO NOTHING
                """)
                
                # Get the user ID
                cur.execute("SELECT id FROM users WHERE email = 'pref_test@test.com'")
                user_row = cur.fetchone()
                if user_row:
                    user_id = user_row[0]
                    
                    cur.execute("""
                        INSERT INTO students (user_id, name, email, department)
                        VALUES (%s, 'Test Student', 'pref_test@test.com', 'CS')
                        ON CONFLICT DO NOTHING
                    """, (user_id,))
                    
                    # Get student ID for later use
                    cur.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
                    student_row = cur.fetchone()
                    if student_row:
                        self.student_id = student_row[0]
                        
                        cur.execute("""
                            INSERT INTO peer_feed_preferences (student_id)
                            VALUES (%s)
                            ON CONFLICT (student_id) DO NOTHING
                        """, (self.student_id,))
            conn.commit()
    
    def teardown_method(self):
        """Clean up."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                if self.student_id is not None:
                    cur.execute("DELETE FROM peer_feed_preferences WHERE student_id = %s", (self.student_id,))
                    cur.execute("DELETE FROM students WHERE id = %s", (self.student_id,))
                cur.execute("DELETE FROM users WHERE email = 'pref_test@test.com'")
            conn.commit()
    
    def test_get_preferences(self):
        """Test retrieving preferences."""
        if self.student_id is None:
            pytest.skip("Student not created")
        
        prefs = get_peer_preferences(self.student_id)
        
        assert prefs is not None
        assert 'show_placements' in prefs
        assert 'anonymous_mode' in prefs
        assert 'email_on_peer_achievement' in prefs
    
    def test_update_preferences(self):
        """Test updating preferences."""
        if self.student_id is None:
            pytest.skip("Student not created")
        
        success = update_peer_preferences(
            student_id=self.student_id,
            anonymous_mode=False,
            email_on_peer_achievement=True
        )
        
        assert success is True
        
        # Verify update
        prefs = get_peer_preferences(self.student_id)
        assert prefs is not None
        assert prefs['anonymous_mode'] is False
        assert prefs['email_on_peer_achievement'] is True
    
    def test_partial_preference_update(self):
        """Test that partial updates don't affect other fields."""
        if self.student_id is None:
            pytest.skip("Student not created")
        
        # Get original
        original = get_peer_preferences(self.student_id)
        assert original is not None
        original_show_skills = original['show_skills']
        
        # Update only one field
        update_peer_preferences(student_id=self.student_id, anonymous_mode=False)
        
        # Verify other field unchanged
        updated = get_peer_preferences(self.student_id)
        assert updated is not None
        assert updated['show_skills'] == original_show_skills


class TestPeerSkills:
    """Test peer skill management and trending."""
    
    def setup_method(self):
        """Setup test data."""
        self.student_ids = []
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO departments (name) VALUES ('CS')
                    ON CONFLICT (name) DO NOTHING
                """)
                
                # Create users and students
                for i in range(1, 4):
                    email = f'skill_student{i}@test.com'
                    cur.execute("""
                        INSERT INTO users (name, email, password, role)
                        VALUES (%s, %s, %s, 'student')
                        ON CONFLICT (email) DO NOTHING
                    """, (f'Student {i}', email, f'hash{i}'))
                    
                    # Get user ID
                    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                    user_row = cur.fetchone()
                    if user_row:
                        user_id = user_row[0]
                        cur.execute("""
                            INSERT INTO students (user_id, name, email, department)
                            VALUES (%s, %s, %s, 'CS')
                            ON CONFLICT DO NOTHING
                        """, (user_id, f'Student {i}', email))
                        
                        # Get student ID
                        cur.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
                        student_row = cur.fetchone()
                        if student_row:
                            self.student_ids.append(student_row[0])
            conn.commit()
    
    def teardown_method(self):
        """Clean up."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for i in range(1, 4):
                    email = f'skill_student{i}@test.com'
                    cur.execute("DELETE FROM peer_skills WHERE student_id IN (SELECT id FROM students WHERE email = %s)", (email,))
                    cur.execute("DELETE FROM students WHERE email = %s", (email,))
                    cur.execute("DELETE FROM users WHERE email = %s", (email,))
            conn.commit()
    
    def test_add_peer_skill(self):
        """Test adding a skill."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        skill_id = add_peer_skill(
            student_id=self.student_ids[0],
            skill_name='Python',
            proficiency_level=3,
            shared=True
        )
        
        assert skill_id is not None
    
    def test_add_skill_invalid_proficiency(self):
        """Test that invalid proficiency level is rejected."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        skill_id = add_peer_skill(
            student_id=self.student_ids[0],
            skill_name='Python',
            proficiency_level=10  # Invalid: should be 1-5
        )
        
        assert skill_id is None
    
    def test_update_existing_skill(self):
        """Test that adding a skill twice updates instead of duplicating."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        # Add skill first time
        skill_id1 = add_peer_skill(
            student_id=self.student_ids[0],
            skill_name='Python',
            proficiency_level=2
        )
        
        # Add same skill again (should update)
        skill_id2 = add_peer_skill(
            student_id=self.student_ids[0],
            skill_name='Python',
            proficiency_level=4
        )
        
        assert skill_id1 == skill_id2, "Should return same skill_id"
    
    def test_get_trending_skills(self):
        """Test trending skills."""
        if not self.student_ids:
            pytest.skip("Student not created")
        
        # Add multiple skills
        for i, student_id in enumerate(self.student_ids, 1):
            add_peer_skill(
                student_id=student_id,
                skill_name='Python',
                proficiency_level=3,
                shared=True
            )
        
        skills = get_trending_skills(limit=5)
        assert isinstance(skills, list)


class TestStudyGroups:
    """Test study group management."""
    
    def setup_method(self):
        """Setup test data."""
        self.student_ids = []
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO departments (name) VALUES ('CS')
                    ON CONFLICT (name) DO NOTHING
                """)
                
                # Create users and students
                for i in range(1, 5):
                    email = f'group_student{i}@test.com'
                    cur.execute("""
                        INSERT INTO users (name, email, password, role)
                        VALUES (%s, %s, %s, 'student')
                        ON CONFLICT (email) DO NOTHING
                    """, (f'Student {i}', email, f'hash{i}'))
                    
                    # Get user ID
                    cur.execute("SELECT id FROM users WHERE email = %s", (email,))
                    user_row = cur.fetchone()
                    if user_row:
                        user_id = user_row[0]
                        cur.execute("""
                            INSERT INTO students (user_id, name, email, department)
                            VALUES (%s, %s, %s, 'CS')
                            ON CONFLICT DO NOTHING
                        """, (user_id, f'Student {i}', email))
                        
                        # Get student ID
                        cur.execute("SELECT id FROM students WHERE user_id = %s", (user_id,))
                        student_row = cur.fetchone()
                        if student_row:
                            self.student_ids.append(student_row[0])
            conn.commit()
    
    def teardown_method(self):
        """Clean up."""
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                for i in range(1, 5):
                    email = f'group_student{i}@test.com'
                    cur.execute("DELETE FROM study_group_members WHERE student_id IN (SELECT id FROM students WHERE email = %s)", (email,))
                    cur.execute("DELETE FROM study_groups WHERE created_by IN (SELECT id FROM students WHERE email = %s)", (email,))
                    cur.execute("DELETE FROM students WHERE email = %s", (email,))
                    cur.execute("DELETE FROM users WHERE email = %s", (email,))
            conn.commit()
    
    def test_create_study_group(self):
        """Test creating a study group."""
        if not self.student_ids:
            pytest.skip("Students not created")
        
        group_id = create_study_group(
            created_by=self.student_ids[0],
            name='AWS Squad',
            description='Preparing for AWS cert',
            goal='AWS Certification by Sept 30',
            max_members=4
        )
        
        assert group_id is not None
        
        # Verify creator is added as member
        groups = get_student_study_groups(self.student_ids[0])
        assert len(groups) > 0
        assert groups[0]['role'] == 'creator'
    
    def test_join_study_group(self):
        """Test joining a study group."""
        if len(self.student_ids) < 2:
            pytest.skip("Need at least 2 students")
        
        group_id = create_study_group(
            created_by=self.student_ids[0],
            name='Test Group',
            description='Test',
            goal='Test goal',
            max_members=4
        )
        
        assert group_id is not None
        success = join_study_group(group_id, self.student_ids[1])
        assert success is True
        
        # Verify member was added
        groups = get_student_study_groups(self.student_ids[1])
        assert len(groups) > 0
        assert groups[0]['id'] == group_id
        assert groups[0]['role'] == 'member'
    
    def test_join_full_study_group(self):
        """Test that joining a full group fails."""
        if len(self.student_ids) < 3:
            pytest.skip("Need at least 3 students")
        
        # Create group with max_members=2
        group_id = create_study_group(
            created_by=self.student_ids[0],
            name='Small Group',
            description='Small group',
            goal='Goal',
            max_members=2
        )
        
        assert group_id is not None, "Group should be created"
        
        # Add one more member (now group is full: 1 creator + 1 member = 2)
        join_study_group(group_id, self.student_ids[1])
        
        # Try to add another (should fail)
        success = join_study_group(group_id, self.student_ids[2])
        assert success is False
    
    def test_get_student_study_groups(self):
        """Test retrieving student's study groups."""
        if not self.student_ids:
            pytest.skip("Students not created")
        
        group_id = create_study_group(
            created_by=self.student_ids[0],
            name='Group A',
            description='Group A desc',
            goal='Goal A'
        )
        
        groups = get_student_study_groups(self.student_ids[0])
        assert len(groups) > 0
        assert groups[0]['name'] == 'Group A'


# Run tests
if __name__ == '__main__':
    pytest.main([__file__, '-v'])
