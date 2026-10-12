import os
import sys
import random
from datetime import datetime, timedelta
import bcrypt

# Add the parent directory to sys.path to import from local modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from database import get_db_connection


def clear_data(conn, cur):
    print("Clearing existing dynamic data...")
    tables = [
        "student_interventions", "notifications", "student_badges", "goal_milestones",
        "student_goals", "student_skills", "mock_tests", "attendance", "marks",
        "notices", "study_resources", "students"
    ]
    for table in tables:
        cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

    cur.execute("DELETE FROM users WHERE LOWER(email) LIKE %s", ("%@example.edu",))
        
    # Re-run consistency checks to recreate tables correctly
    import services.attendance_service as attendance_service
    import services.marks_service as marks_service
    import services.mock_service as mock_service
    import services.skills_service as skills_service
    import services.student_service as student_service
    import services.subject_service as subject_service
    from services.goals_service import ensure_goals_tables
    from services.notice_board_service import NoticeBoardService
    from services.resources_service import ResourcesService

    student_service._STUDENT_SCHEMA_READY = False
    subject_service._SUBJECT_SCHEMA_READY = False
    marks_service._MARKS_SCHEMA_READY = False
    attendance_service._ATTENDANCE_SCHEMA_READY = False
    mock_service._MOCK_SCHEMA_READY = False
    skills_service._SKILLS_SCHEMA_READY = False

    student_service.ensure_student_table_consistency(conn)
    subject_service.ensure_subject_table_consistency(conn)
    marks_service.ensure_marks_table_consistency(conn)
    attendance_service.ensure_attendance_table_consistency(conn)
    mock_service.ensure_mock_tests_table_consistency(conn)
    skills_service.ensure_skills_table_consistency(conn)
    ensure_goals_tables(conn)
    NoticeBoardService.ensure_notices_table(conn)
    ResourcesService.ensure_resources_table(conn)


def ensure_roles(cur):
    cur.execute("""
        INSERT INTO roles (id, role_name)
        VALUES (1, 'Admin'), (2, 'Faculty'), (3, 'Student')
        ON CONFLICT (id) DO UPDATE SET role_name = EXCLUDED.role_name
    """)


def ensure_demo_institution(cur):
    cur.execute(
        """
        INSERT INTO institutions (name, code, subdomain, plan_name, status, is_default)
        VALUES ('Demo Campus', 'DEMO', 'demo', 'enterprise', 'active', TRUE)
        ON CONFLICT DO NOTHING
        """
    )
    cur.execute(
        """
        SELECT id FROM institutions
        WHERE UPPER(code) = 'DEMO'
        ORDER BY id ASC
        LIMIT 1
        """
    )
    return cur.fetchone()[0]


def seed_super_admin(cur, institution_id):
    print("Seeding super admin user...")
    password_hash = bcrypt.hashpw("password123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    cur.execute(
        """
        INSERT INTO users (name, email, password, role_id, institution_id, is_super_admin)
        VALUES (%s, %s, %s, 1, %s, TRUE)
        ON CONFLICT DO NOTHING
        RETURNING id
        """,
        ("Super Admin", "superadmin@smartcampus.edu", password_hash, institution_id),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s) LIMIT 1", ("superadmin@smartcampus.edu",))
    return cur.fetchone()[0]


def seed_admin(cur, institution_id):
    print("Seeding institution admin user...")
    password_hash = bcrypt.hashpw("password123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    cur.execute(
        """
        INSERT INTO users (name, email, password, role_id, institution_id, is_super_admin)
        VALUES (%s, %s, %s, 1, %s, FALSE)
        ON CONFLICT DO NOTHING
        RETURNING id
        """,
        ("Demo Admin", "admin@smartcampus.edu", password_hash, institution_id),
    )
    row = cur.fetchone()
    if row:
        return row[0]

    cur.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s) LIMIT 1", ("admin@smartcampus.edu",))
    return cur.fetchone()[0]


def seed_faculty(cur, institution_id):
    print("Seeding faculty user...")
    password_hash = bcrypt.hashpw("password123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    cur.execute("SELECT id FROM users WHERE LOWER(email) = LOWER(%s)", ("faculty@smartcampus.edu",))
    existing = cur.fetchone()

    if existing:
        cur.execute("""
            UPDATE users
            SET name = %s, password = %s, role_id = 2, institution_id = %s
            WHERE id = %s
            RETURNING id
        """, ("Dr. Sarah Smith", password_hash, institution_id, existing[0]))
        return cur.fetchone()[0]

    cur.execute("""
        INSERT INTO users (name, email, password, role_id, institution_id)
        VALUES (%s, %s, %s, 2, %s)
        RETURNING id
    """, ("Dr. Sarah Smith", "faculty@smartcampus.edu", password_hash, institution_id))
    return cur.fetchone()[0]

def seed_departments(cur, institution_id):
    print("Seeding departments...")
    departments = ["Computer Science", "Information Technology", "Electronic Engineering", "Mechanical Engineering"]
    for dept in departments:
        cur.execute(
            """
            INSERT INTO departments (name, institution_id)
            VALUES (%s, %s)
            ON CONFLICT DO NOTHING
            """,
            (dept, institution_id),
        )

def seed_subjects(cur, institution_id):
    print("Seeding subjects...")
    subjects = [
        ("Data Structures", "CS101", "Computer Science"),
        ("Algorithms", "CS102", "Computer Science"),
        ("Database Systems", "CS201", "Computer Science"),
        ("Operating Systems", "CS202", "Computer Science"),
        ("Web Development", "IT101", "Information Technology"),
        ("Cloud Computing", "IT201", "Information Technology"),
        ("Digital Circuits", "EE101", "Electronic Engineering"),
        ("Microprocessors", "EE201", "Electronic Engineering"),
        ("Thermodynamics", "ME101", "Mechanical Engineering"),
        ("Fluid Mechanics", "ME201", "Mechanical Engineering"),
    ]
    cur.execute("SELECT id, name FROM subjects WHERE institution_id = %s", (institution_id,))
    existing = {name: id for id, name in cur.fetchall()}
    
    for name, code, dept in subjects:
        if name not in existing:
            cur.execute(
                """
                INSERT INTO subjects (name, code, department, institution_id)
                VALUES (%s, %s, %s, %s)
                RETURNING id
                """,
                (name, code, dept, institution_id),
            )
            existing[name] = cur.fetchone()[0]
    return existing

def seed_students(cur, institution_id, count=55):
    print(f"Seeding {count} students...")
    first_names = ["Arjun", "Neha", "Rohan", "Sanya", "Vikram", "Anjali", "Kabir", "Ishani", "Arav", "Meera", "Ishaan", "Zoya", "Aditya", "Riya", "Aaryan", "Ananya"]
    last_names = ["Sharma", "Verma", "Gupta", "Malhotra", "Kapoor", "Joshi", "Patel", "Reddy", "Nair", "Iyer", "Mehta", "Singh"]
    depts = ["Computer Science", "Information Technology", "Electronic Engineering", "Mechanical Engineering"]
    
    students = []
    for i in range(count):
        fname = random.choice(first_names)
        lname = random.choice(last_names)
        email = f"{fname.lower()}.{lname.lower()}.{i}@example.edu"
        roll = f"2024{1000 + i}"
        dept = random.choice(depts)
        
        name = f"{fname} {lname}"
        password_hash = bcrypt.hashpw("password123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
        cur.execute("""
            INSERT INTO users (name, email, password, role_id, institution_id)
            VALUES (%s, %s, %s, 3, %s)
            RETURNING id
        """, (name, email, password_hash, institution_id))
        user_id = cur.fetchone()[0]

        cur.execute("""
            INSERT INTO students (name, email, department, roll_number, user_id, institution_id)
            VALUES (%s, %s, %s, %s, %s, %s) RETURNING id
        """, (name, email, dept, roll, user_id, institution_id))
        student_id = cur.fetchone()[0]
        students.append({"id": student_id, "dept": dept})
    return students

def seed_marks_and_attendance(cur, students, subject_map):
    print("Seeding marks and attendance...")
    for student in students:
        # Pick 4 random subjects
        picked_subjects = random.sample(list(subject_map.values()), 4)
        
        for sub_id in picked_subjects:
            # Seed 3-5 marks per subject
            for _ in range(random.randint(3, 5)):
                marks = random.randint(40, 98)
                cur.execute("INSERT INTO marks (student_id, subject_id, marks) VALUES (%s, %s, %s)", (student['id'], sub_id, marks))
            
            # Seed 20-30 attendance records per subject
            end_date = datetime.now()
            for day in range(30):
                date = end_date - timedelta(days=day)
                status = "Present" if random.random() < 0.85 else "Absent"
                cur.execute("INSERT INTO attendance (student_id, subject_id, date, status) VALUES (%s, %s, %s, %s)", 
                           (student['id'], sub_id, date.date(), status))

def seed_notices_and_resources(cur, faculty_id, institution_id):
    print("Seeding notices and resources...")
    notices = [
        ("Campus Recruitment 2024", "Top companies are visiting next month. Keep your profiles updated.", "All"),
        ("Mid-Term Exam Schedule", "Exams start from 20th October. Check the portal for details.", "Student"),
        ("Hackathon Announcement", "Annual 24-hour hackathon registrations are open now.", "Student"),
    ]
    for title, content, target in notices:
        cur.execute("""
                INSERT INTO notices (title, content, target_role, author_id, institution_id)
                VALUES (%s, %s, %s, %s, %s)
        """, (title, content, target, faculty_id, institution_id))
    
    resources = [
        ("Advanced Data Structures PDF", "Comprehensive guide to trees and graphs", "https://example.com/ds", "Algorithms"),
        ("Machine Learning Basics", "Introductory slides for ML", "https://example.com/ml", "Cloud Computing"),
    ]
    for title, desc, link, sub_name in resources:
        cur.execute("SELECT id FROM subjects WHERE name = %s LIMIT 1", (sub_name,))
        sub_id = cur.fetchone()
        if sub_id:
            cur.execute("""
                INSERT INTO study_resources (title, description, resource_link, subject_id, uploaded_by)
                VALUES (%s, %s, %s, %s, %s)
            """, (title, desc, link, sub_id[0], faculty_id))

def run_seed():
    try:
        from services.migration_service import run_migrations

        run_migrations()
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                clear_data(conn, cur)
                ensure_roles(cur)
                institution_id = ensure_demo_institution(cur)
                seed_super_admin(cur, institution_id)
                seed_admin(cur, institution_id)
                faculty_id = seed_faculty(cur, institution_id)
                seed_departments(cur, institution_id)
                subject_map = seed_subjects(cur, institution_id)
                students = seed_students(cur, institution_id, count=60)
                seed_marks_and_attendance(cur, students, subject_map)
                seed_notices_and_resources(cur, faculty_id, institution_id)

        print("Success: Database successfully enriched with production-ready data!")
        print("Demo logins: superadmin@smartcampus.edu / password123")
        print("Demo logins: admin@smartcampus.edu / password123")
        print("Demo logins: faculty@smartcampus.edu / password123")
    except Exception as e:
        print(f"Error during seeding: {e}")

if __name__ == "__main__":
    run_seed()
