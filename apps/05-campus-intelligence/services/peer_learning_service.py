from database import get_db_connection
from services.readiness_service import STUDENT_SCORE_CTE

def get_subject_mentors(subject_id, limit=5, institution_id=None):
    """
    Find students who excel in a specific subject.
    Criteria: Marks > 85
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    s.id as student_id,
                    s.name,
                    s.roll_number,
                    s.department,
                    m.marks
                FROM students s
                JOIN marks m ON s.id = m.student_id
                WHERE m.subject_id = %s
                  AND m.marks >= 85
                  AND (%s IS NULL OR s.institution_id = %s)
                ORDER BY m.marks DESC, s.name ASC
                LIMIT %s
                """,
                (subject_id, institution_id, institution_id, limit)
            )
            rows = cur.fetchall()

    return [
        {
            "student_id": row[0],
            "name": row[1],
            "roll_number": row[2],
            "department": row[3],
            "marks": float(row[4])
        }
        for row in rows
    ]

def get_peer_mentorship_suggestions(student_id, institution_id=None):
    """
    Identify subjects where the student is struggling and suggest mentors.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # 1. Find subjects where student marks < 60
            cur.execute(
                """
                SELECT
                    m.subject_id,
                    sbj.name as subject_name,
                    m.marks
                FROM marks m
                JOIN subjects sbj ON m.subject_id = sbj.id
                JOIN students s ON s.id = m.student_id
                WHERE m.student_id = %s
                  AND m.marks < 60
                  AND (%s IS NULL OR s.institution_id = %s)
                ORDER BY m.marks ASC
                """,
                (student_id, institution_id, institution_id)
            )
            struggling_subjects = cur.fetchall()

    suggestions = []
    for sub_id, sub_name, marks in struggling_subjects:
        mentors = get_subject_mentors(sub_id, limit=3, institution_id=institution_id)
        if mentors:
            suggestions.append({
                "subject_id": sub_id,
                "subject_name": sub_name,
                "student_marks": float(marks),
                "suggested_mentors": mentors
            })

    return suggestions

def get_mentor_dashboard_stats(student_id):
    """
    Check if the student themselves is a mentor for any subjects.
    """
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    sbj.id as subject_id,
                    sbj.name as subject_name,
                    MAX(m.marks) as best_marks
                FROM marks m
                JOIN subjects sbj ON m.subject_id = sbj.id
                WHERE m.student_id = %s
                GROUP BY sbj.id, sbj.name
                HAVING MAX(m.marks) >= 85
                """,
                (student_id,)
            )
            subjects = cur.fetchall()

    return [
        {
            "subject_id": row[0],
            "subject_name": row[1],
            "marks": float(row[2])
        }
        for row in subjects
    ]


# ===================================================================
# SPRINT 3: PEER LEARNING FEED FEATURE
# ===================================================================

import logging
import json
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


def ensure_peer_tables_consistency():
    """
    Idempotent bootstrap: Ensure all peer learning tables exist.
    Called once on app startup via migration runner.
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if migration 009 was already applied
                cur.execute("""
                    SELECT EXISTS (
                        SELECT 1 FROM information_schema.tables 
                        WHERE table_schema = 'public' 
                        AND table_name = 'peer_achievements'
                    )
                """)
                
                if not cur.fetchone()[0]:
                    logger.warning("Peer learning tables not found. Run migrations first.")
                    return False
        
        logger.info("✓ Peer learning tables verified")
        return True
        
    except Exception as e:
        logger.error(f"Error ensuring peer tables: {e}")
        return False


def record_peer_achievement(
    student_id: int,
    achievement_type: str,
    achievement_data: Dict[str, Any],
    is_anonymous: bool = True,
    consent_given: bool = False
) -> Optional[int]:
    """
    Record a student achievement (placement, skill, badge, goal).
    
    Args:
        student_id: Student who achieved this
        achievement_type: 'placement', 'skill', 'badge', or 'goal'
        achievement_data: JSONB data (company, skill_name, etc.)
        is_anonymous: If True, show as "Student from CS-A"
        consent_given: Student consented to share this
        
    Returns:
        achievement_id on success, None on error
    """
    if achievement_type not in ['placement', 'skill', 'badge', 'goal']:
        logger.error(f"Invalid achievement type: {achievement_type}")
        return None
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Verify student exists
                cur.execute("SELECT id FROM students WHERE id = %s", (student_id,))
                if not cur.fetchone():
                    logger.warning(f"Student {student_id} not found")
                    return None
                
                # Insert achievement
                cur.execute("""
                    INSERT INTO peer_achievements 
                    (student_id, achievement_type, achievement_data, is_anonymous, consent_given)
                    VALUES (%s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    student_id,
                    achievement_type,
                    json.dumps(achievement_data),
                    is_anonymous,
                    consent_given
                ))
                
                achievement_id = cur.fetchone()[0]
            conn.commit()
        
        logger.info(f"✓ Recorded {achievement_type} achievement for student {student_id}")
        return achievement_id
        
    except Exception as e:
        logger.error(f"Error recording achievement: {e}")
        return None


def get_peer_feed_for_student(
    student_id: int,
    limit: int = 50,
    offset: int = 0,
    achievement_types: Optional[List[str]] = None,
    institution_id: int | None = None,
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Get personalized peer feed for a student (respecting privacy settings).
    
    Args:
        student_id: Student requesting the feed
        limit: Max items to return (pagination)
        offset: Starting position (pagination)
        achievement_types: Filter by type ['placement', 'skill', 'badge', 'goal']
        
    Returns:
        Tuple of (feed_items, total_count)
    """
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                
                # Get viewing student's preferences
                cur.execute("""
                    SELECT anonymous_mode FROM peer_feed_preferences WHERE student_id = %s
                """, (student_id,))
                
                result = cur.fetchone()
                viewer_anonymous_mode = result[0] if result else True
                
                # Build query for feed items
                base_query = """
                    SELECT 
                        pa.id,
                        pa.student_id,
                        pa.achievement_type,
                        pa.achievement_data,
                        pa.is_anonymous,
                        pa.created_at,
                        s.department
                    FROM peer_achievements pa
                    JOIN students s ON pa.student_id = s.id
                    WHERE pa.visibility = TRUE
                    AND pa.student_id != %s
                    AND (%s IS NULL OR s.institution_id = %s)
                """
                
                params = [student_id, institution_id, institution_id]
                
                # Filter by achievement types if provided
                if achievement_types:
                    placeholders = ','.join(['%s'] * len(achievement_types))
                    base_query += f" AND pa.achievement_type IN ({placeholders})"
                    params.extend(achievement_types)
                
                # Count total items
                count_query = f"SELECT COUNT(*) FROM ({base_query}) AS count_subquery"
                cur.execute(count_query, params[:3 + len(achievement_types or [])])
                total_count = cur.fetchone()[0]
                
                # Get paginated results (ordered by recent)
                query = base_query + """
                    ORDER BY pa.created_at DESC
                    LIMIT %s OFFSET %s
                """
                params.extend([limit, offset])
                
                cur.execute(query, params)
                rows = cur.fetchall()
                
                # Format feed items
                feed_items = []
                for row in rows:
                    item_id, author_id, ach_type, ach_data, is_anonymous, created_at, dept = row
                    
                    # Anonymize if needed
                    if is_anonymous:
                        display_name = f"Student from {dept}"
                    else:
                        cur.execute("SELECT name FROM students WHERE id = %s", (author_id,))
                        name_row = cur.fetchone()
                        display_name = name_row[0] if name_row else f"Student from {dept}"
                    
                    feed_item = {
                        'id': item_id,
                        'achievement_type': ach_type,
                        'student_profile': {
                            'display_name': display_name,
                            'department': dept
                        },
                        'achievement_data': json.loads(ach_data),
                        'created_at': created_at.isoformat() if created_at else None,
                        'engagement': {
                            'likes': 0,
                            'shares': 0,
                            'comments': 0
                        }
                    }
                    feed_items.append(feed_item)
                
        return feed_items, total_count
        
    except Exception as e:
        logger.error(f"Error getting peer feed: {e}")
        return [], 0


def get_peer_achievements_summary(student_id: int, institution_id=None) -> Dict[str, Any]:
    """Get summary statistics of peer achievements (for dashboard)."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                
                # Total achievements
                cur.execute("""
                    SELECT COUNT(*), achievement_type 
                    FROM peer_achievements pa
                    JOIN students s ON s.id = pa.student_id
                    WHERE visibility = TRUE
                      AND (%s IS NULL OR s.institution_id = %s)
                    GROUP BY achievement_type
                """, (institution_id, institution_id))
                
                achievement_counts = {row[1]: row[0] for row in cur.fetchall()}
                
                # Placement summary
                placement_data = []
                if achievement_counts.get('placement', 0) > 0:
                    cur.execute("""
                        SELECT 
                            achievement_data->>'company' as company,
                            COUNT(*) as count,
                            AVG(CAST(achievement_data->>'package' AS FLOAT)) as avg_package
                        FROM peer_achievements
                        JOIN students s ON s.id = peer_achievements.student_id
                        WHERE achievement_type = 'placement'
                        AND visibility = TRUE
                        AND (%s IS NULL OR s.institution_id = %s)
                        GROUP BY company
                        ORDER BY count DESC
                        LIMIT 10
                    """, (institution_id, institution_id))
                    placement_data = cur.fetchall()
                
                # Skills summary
                cur.execute("""
                    SELECT skill_name, COUNT(*) as count 
                    FROM peer_skills 
                    JOIN students s ON s.id = peer_skills.student_id
                    WHERE shared = TRUE 
                      AND (%s IS NULL OR s.institution_id = %s)
                    GROUP BY skill_name 
                    ORDER BY count DESC 
                    LIMIT 5
                """, (institution_id, institution_id))
                trending_skills = [row[0] for row in cur.fetchall()]
                
                # Study groups summary
                cur.execute("""
                    SELECT sg.status, COUNT(*)
                    FROM study_groups sg
                    JOIN students s ON s.id = sg.created_by
                    WHERE (%s IS NULL OR s.institution_id = %s)
                    GROUP BY sg.status
                """, (institution_id, institution_id))
                group_stats = {row[0]: row[1] for row in cur.fetchall()}
                
                summary = {
                    'total_achievements': sum(achievement_counts.values()),
                    'placements': {
                        'count': achievement_counts.get('placement', 0),
                        'companies': [row[0] for row in placement_data],
                        'avg_package': float(placement_data[0][2]) if placement_data else 0
                    },
                    'skills': {
                        'count': achievement_counts.get('skill', 0),
                        'trending': trending_skills
                    },
                    'study_groups': {
                        'active_count': group_stats.get('active', 0),
                        'completed_count': group_stats.get('completed', 0)
                    }
                }
                
        return summary
        
    except Exception as e:
        logger.error(f"Error getting achievements summary: {e}")
        return {}


def update_peer_preferences(
    student_id: int,
    show_placements: Optional[bool] = None,
    show_skills: Optional[bool] = None,
    show_study_groups: Optional[bool] = None,
    anonymous_mode: Optional[bool] = None,
    email_on_peer_achievement: Optional[bool] = None,
    email_on_study_group_invite: Optional[bool] = None
) -> bool:
    """Update peer feed preferences for a student."""
    try:
        # Build dynamic update query
        updates = []
        params = []
        
        if show_placements is not None:
            updates.append("show_placements = %s")
            params.append(show_placements)
        
        if show_skills is not None:
            updates.append("show_skills = %s")
            params.append(show_skills)
        
        if show_study_groups is not None:
            updates.append("show_study_groups = %s")
            params.append(show_study_groups)
        
        if anonymous_mode is not None:
            updates.append("anonymous_mode = %s")
            params.append(anonymous_mode)
        
        if email_on_peer_achievement is not None:
            updates.append("email_on_peer_achievement = %s")
            params.append(email_on_peer_achievement)
        
        if email_on_study_group_invite is not None:
            updates.append("email_on_study_group_invite = %s")
            params.append(email_on_study_group_invite)
        
        if not updates:
            logger.warning("No preferences to update")
            return False
        
        updates.append("updated_at = CURRENT_TIMESTAMP")
        
        # Execute update
        query = f"""
            UPDATE peer_feed_preferences 
            SET {', '.join(updates)} 
            WHERE student_id = %s
        """
        params.append(student_id)
        
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, params)
            conn.commit()
        
        logger.info(f"✓ Updated preferences for student {student_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error updating preferences: {e}")
        return False


def get_peer_preferences(student_id: int) -> Optional[Dict[str, Any]]:
    """Get peer feed preferences for a student."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        show_placements, show_skills, show_study_groups, anonymous_mode,
                        email_on_peer_achievement, email_on_study_group_invite
                    FROM peer_feed_preferences
                    WHERE student_id = %s
                """, (student_id,))
                
                row = cur.fetchone()
        
        if not row:
            return None
        
        return {
            'show_placements': row[0],
            'show_skills': row[1],
            'show_study_groups': row[2],
            'anonymous_mode': row[3],
            'email_on_peer_achievement': row[4],
            'email_on_study_group_invite': row[5]
        }
        
    except Exception as e:
        logger.error(f"Error getting preferences: {e}")
        return None


def add_peer_skill(
    student_id: int,
    skill_name: str,
    proficiency_level: int = 1,
    shared: bool = False,
    resource_link: Optional[str] = None
) -> Optional[int]:
    """Record a skill learned by a student."""
    if not 1 <= proficiency_level <= 5:
        logger.error(f"Invalid proficiency level: {proficiency_level}")
        return None
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if skill already exists
                cur.execute("""
                    SELECT id FROM peer_skills 
                    WHERE student_id = %s AND LOWER(skill_name) = LOWER(%s)
                """, (student_id, skill_name))
                
                existing = cur.fetchone()
                
                if existing:
                    # Update existing skill
                    cur.execute("""
                        UPDATE peer_skills 
                        SET proficiency_level = %s, shared = %s, resource_link = %s,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = %s
                        RETURNING id
                    """, (proficiency_level, shared, resource_link, existing[0]))
                    
                    skill_id = cur.fetchone()[0]
                    logger.info(f"✓ Updated skill for student {student_id}")
                else:
                    # Create new skill
                    cur.execute("""
                        INSERT INTO peer_skills 
                        (student_id, skill_name, proficiency_level, shared, resource_link)
                        VALUES (%s, %s, %s, %s, %s)
                        RETURNING id
                    """, (student_id, skill_name, proficiency_level, shared, resource_link))
                    
                    skill_id = cur.fetchone()[0]
                    logger.info(f"✓ Added skill for student {student_id}")
            
            conn.commit()
        return skill_id
        
    except Exception as e:
        logger.error(f"Error adding skill: {e}")
        return None


def get_trending_skills(limit: int = 5, institution_id=None) -> List[Dict[str, Any]]:
    """Get trending skills across all students."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                
                cur.execute("""
                    SELECT 
                        skill_name,
                        COUNT(DISTINCT student_id) as student_count,
                        AVG(proficiency_level) as avg_proficiency,
                        SUM(recommendation_count) as recommendation_count
                    FROM peer_skills
                    JOIN students s ON s.id = peer_skills.student_id
                    WHERE shared = TRUE
                      AND (%s IS NULL OR s.institution_id = %s)
                    GROUP BY skill_name
                    ORDER BY student_count DESC
                    LIMIT %s
                """, (institution_id, institution_id, limit))
                
                skills = []
                for row in cur.fetchall():
                    skills.append({
                        'skill_name': row[0],
                        'student_count': row[1],
                        'avg_proficiency': float(row[2]) if row[2] else 0,
                        'recommendation_count': row[3] or 0
                    })
                
        return skills
        
    except Exception as e:
        logger.error(f"Error getting trending skills: {e}")
        return []


def create_study_group(
    created_by: int,
    name: str,
    description: str,
    goal: str,
    target_date: Optional[str] = None,
    max_members: int = 4
) -> Optional[int]:
    """Create a new study group."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Create group
                cur.execute("""
                    INSERT INTO study_groups 
                    (name, description, goal, created_by, target_date, max_members)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (name, description, goal, created_by, target_date, max_members))
                
                group_id = cur.fetchone()[0]
                
                # Add creator as first member
                cur.execute("""
                    INSERT INTO study_group_members 
                    (study_group_id, student_id, role)
                    VALUES (%s, %s, 'creator')
                """, (group_id, created_by))
            
            conn.commit()
        logger.info(f"✓ Created study group {group_id}")
        return group_id
        
    except Exception as e:
        logger.error(f"Error creating study group: {e}")
        return None


def join_study_group(group_id: int, student_id: int, institution_id=None) -> bool:
    """Add a student to a study group."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                # Check if group is full
                cur.execute("""
                    SELECT current_member_count, max_members 
                    FROM study_groups sg
                    JOIN students creator ON creator.id = sg.created_by
                    JOIN students requester ON requester.id = %s
                    WHERE sg.id = %s
                      AND (%s IS NULL OR (creator.institution_id = %s AND requester.institution_id = %s))
                """, (student_id, group_id, institution_id, institution_id, institution_id))
                
                result = cur.fetchone()
                if not result:
                    logger.warning(f"Study group {group_id} not found")
                    return False
                
                current, max_members = result
                
                if current >= max_members:
                    logger.warning(f"Study group {group_id} is full")
                    return False
                
                # Add member
                cur.execute("""
                    INSERT INTO study_group_members 
                    (study_group_id, student_id, role)
                    VALUES (%s, %s, 'member')
                """, (group_id, student_id))
                
                # Increment member count
                cur.execute("""
                    UPDATE study_groups 
                    SET current_member_count = current_member_count + 1 
                    WHERE id = %s
                """, (group_id,))
            
            conn.commit()
        logger.info(f"✓ Student {student_id} joined study group {group_id}")
        return True
        
    except Exception as e:
        logger.error(f"Error joining study group: {e}")
        return False


def get_student_study_groups(student_id: int) -> List[Dict[str, Any]]:
    """Get all study groups a student is member of."""
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        sg.id, sg.name, sg.description, sg.goal, sg.target_date,
                        sg.status, sg.current_member_count, sg.max_members,
                        sgm.role, sgm.contribution_score
                    FROM study_groups sg
                    JOIN study_group_members sgm ON sg.id = sgm.study_group_id
                    WHERE sgm.student_id = %s
                    ORDER BY sgm.joined_at DESC
                """, (student_id,))
                
                groups = []
                for row in cur.fetchall():
                    groups.append({
                        'id': row[0],
                        'name': row[1],
                        'description': row[2],
                        'goal': row[3],
                        'target_date': row[4].isoformat() if row[4] else None,
                        'status': row[5],
                        'current_members': row[6],
                        'max_members': row[7],
                        'role': row[8],
                        'contribution_score': row[9]
                    })
        
        return groups
        
    except Exception as e:
        logger.error(f"Error getting student study groups: {e}")
        return []
