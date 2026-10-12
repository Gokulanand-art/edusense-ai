"""
Company Matching Service — matches students to placement companies.

The core feature: "Here's which companies you can join, and which you're close to qualifying for."

This is the most emotionally resonant feature. A student seeing "You are 8 points away 
from Infosys placement" will use the app every single day.
"""
import logging
from contextlib import nullcontext

from database import get_db_connection
from services.student_service import ensure_student_table_consistency
from services.student_service import get_student_profile
from services.readiness_service import calculate_readiness

logger = logging.getLogger(__name__)

_COMPANIES_SCHEMA_READY = False


def _connection_scope(connection=None):
    """Provide connection context manager."""
    if connection is not None:
        return nullcontext(connection)
    return get_db_connection()


def ensure_companies_table_consistency(connection=None):
    """Ensure placement_companies table exists."""
    global _COMPANIES_SCHEMA_READY
    
    if _COMPANIES_SCHEMA_READY:
        return
    
    def apply_schema(conn):
        ensure_student_table_consistency(conn)
        
        with conn.cursor() as cur:
            # Companies table
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS placement_companies (
                    id SERIAL PRIMARY KEY,
                    name VARCHAR(100) NOT NULL UNIQUE,
                    min_cgpa DECIMAL(3, 2) NOT NULL,
                    min_attendance INTEGER NOT NULL DEFAULT 75,
                    min_mock_score INTEGER NOT NULL DEFAULT 60,
                    min_marks_percentage DECIMAL(5, 2) NOT NULL DEFAULT 60,
                    package_lpa DECIMAL(4, 2) NOT NULL,
                    sector VARCHAR(100),
                    required_skills TEXT[],
                    description TEXT,
                    logo_url VARCHAR(500),
                    website_url VARCHAR(500),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            
            # Add columns if missing
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS name VARCHAR(100)")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS min_cgpa DECIMAL(3, 2)")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS min_attendance INTEGER DEFAULT 75")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS min_mock_score INTEGER DEFAULT 60")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS min_marks_percentage DECIMAL(5, 2) DEFAULT 60")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS package_lpa DECIMAL(4, 2)")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS sector VARCHAR(100)")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS required_skills TEXT[]")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS description TEXT")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500)")
            cur.execute("ALTER TABLE placement_companies ADD COLUMN IF NOT EXISTS website_url VARCHAR(500)")
            
            cur.execute("DROP INDEX IF EXISTS idx_placement_companies_name")
            cur.execute("CREATE INDEX idx_placement_companies_name ON placement_companies(name)")
            cur.execute("DROP INDEX IF EXISTS idx_placement_companies_min_cgpa")
            cur.execute("CREATE INDEX idx_placement_companies_min_cgpa ON placement_companies(min_cgpa)")
            
            # Student-company applications tracking table (optional, for future)
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS student_company_applications (
                    id SERIAL PRIMARY KEY,
                    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
                    company_id INTEGER NOT NULL REFERENCES placement_companies(id) ON DELETE CASCADE,
                    status VARCHAR(20) DEFAULT 'interested',
                    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            
            cur.execute("ALTER TABLE student_company_applications ADD COLUMN IF NOT EXISTS student_id INTEGER")
            cur.execute("ALTER TABLE student_company_applications ADD COLUMN IF NOT EXISTS company_id INTEGER")
            cur.execute("ALTER TABLE student_company_applications ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'interested'")
            cur.execute("ALTER TABLE student_company_applications ADD COLUMN IF NOT EXISTS applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP")
            
            cur.execute("DROP INDEX IF EXISTS idx_student_company_student_id")
            cur.execute("CREATE INDEX idx_student_company_student_id ON student_company_applications(student_id)")
            cur.execute("DROP INDEX IF EXISTS idx_student_company_company_id")
            cur.execute("CREATE INDEX idx_student_company_company_id ON student_company_applications(company_id)")
            cur.execute("DROP INDEX IF EXISTS idx_student_company_unique")
            cur.execute("CREATE UNIQUE INDEX idx_student_company_unique ON student_company_applications(student_id, company_id)")
    
    if connection is not None:
        apply_schema(connection)
    else:
        with get_db_connection() as conn:
            apply_schema(conn)
    
    _COMPANIES_SCHEMA_READY = True


def seed_default_companies(connection=None):
    """Seed with 10 common campus placement companies (Indian context)."""
    companies_data = [
        {
            "name": "TCS (Tata Consultancy Services)",
            "min_cgpa": 3.0,
            "min_attendance": 75,
            "min_mock_score": 70,
            "min_marks_percentage": 65,
            "package_lpa": 3.5,
            "sector": "IT Consulting",
            "required_skills": ["Java", "Python", "SQL"],
        },
        {
            "name": "Infosys",
            "min_cgpa": 3.2,
            "min_attendance": 80,
            "min_mock_score": 75,
            "min_marks_percentage": 70,
            "package_lpa": 4.5,
            "sector": "IT Services",
            "required_skills": ["Python", "Java", "DSA"],
        },
        {
            "name": "Wipro",
            "min_cgpa": 3.0,
            "min_attendance": 75,
            "min_mock_score": 70,
            "min_marks_percentage": 65,
            "package_lpa": 4.0,
            "sector": "IT Services",
            "required_skills": ["Java", "SQL", "HTML"],
        },
        {
            "name": "Cognizant",
            "min_cgpa": 2.8,
            "min_attendance": 75,
            "min_mock_score": 60,
            "min_marks_percentage": 60,
            "package_lpa": 3.5,
            "sector": "IT Consulting",
            "required_skills": ["Java", "Python"],
        },
        {
            "name": "Accenture",
            "min_cgpa": 3.2,
            "min_attendance": 80,
            "min_mock_score": 75,
            "min_marks_percentage": 70,
            "package_lpa": 5.0,
            "sector": "IT Consulting",
            "required_skills": ["Java", "Python", "Salesforce"],
        },
        {
            "name": "HCL Technologies",
            "min_cgpa": 3.0,
            "min_attendance": 75,
            "min_mock_score": 65,
            "min_marks_percentage": 60,
            "package_lpa": 3.8,
            "sector": "IT Services",
            "required_skills": ["Java", "SQL"],
        },
        {
            "name": "Tech Mahindra",
            "min_cgpa": 2.9,
            "min_attendance": 75,
            "min_mock_score": 65,
            "min_marks_percentage": 60,
            "package_lpa": 3.5,
            "sector": "IT Services",
            "required_skills": ["Python", "Java"],
        },
        {
            "name": "IBM",
            "min_cgpa": 3.3,
            "min_attendance": 80,
            "min_mock_score": 80,
            "min_marks_percentage": 75,
            "package_lpa": 6.0,
            "sector": "IT Consulting",
            "required_skills": ["Java", "Cloud", "AI/ML"],
        },
        {
            "name": "Microsoft",
            "min_cgpa": 3.5,
            "min_attendance": 85,
            "min_mock_score": 85,
            "min_marks_percentage": 80,
            "package_lpa": 8.0,
            "sector": "Technology",
            "required_skills": ["C++", "Python", "System Design"],
        },
        {
            "name": "Google India",
            "min_cgpa": 3.6,
            "min_attendance": 85,
            "min_mock_score": 90,
            "min_marks_percentage": 85,
            "package_lpa": 10.0,
            "sector": "Technology",
            "required_skills": ["DSA", "Python", "System Design"],
        },
    ]
    
    with _connection_scope(connection) as conn:
        ensure_companies_table_consistency(conn)
        
        with conn.cursor() as cur:
            for company in companies_data:
                cur.execute(
                    """
                    INSERT INTO placement_companies 
                    (name, min_cgpa, min_attendance, min_mock_score, min_marks_percentage, 
                     package_lpa, sector, required_skills)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (name) DO NOTHING
                    """,
                    (
                        company["name"],
                        company["min_cgpa"],
                        company["min_attendance"],
                        company["min_mock_score"],
                        company["min_marks_percentage"],
                        company["package_lpa"],
                        company["sector"],
                        company.get("required_skills", []),
                    ),
                )


def calculate_company_match_score(student_metrics: dict, company_requirements: dict) -> dict:
    """
    Calculate how well a student matches a company.
    
    Returns match score (0-100) and detailed gap analysis.
    """
    student_marks = float(student_metrics.get("marks", 0))
    student_attendance = float(student_metrics.get("attendance", 0))
    student_mock = float(student_metrics.get("mock_score", 0))
    student_skills = student_metrics.get("skills", [])
    
    req_marks = float(company_requirements.get("min_marks_percentage", 60))
    req_attendance = float(company_requirements.get("min_attendance", 75))
    req_mock = float(company_requirements.get("min_mock_score", 60))
    req_skills = company_requirements.get("required_skills", [])
    
    # Calculate component match scores (0-100)
    marks_match = min(100, (student_marks / req_marks) * 100) if req_marks > 0 else 100
    attendance_match = min(100, (student_attendance / req_attendance) * 100) if req_attendance > 0 else 100
    mock_match = min(100, (student_mock / req_mock) * 100) if req_mock > 0 else 100
    
    # Skills matching
    student_skill_names = [s.lower() for s in student_skills]
    matched_skills = [s for s in req_skills if s.lower() in student_skill_names]
    skills_match = (len(matched_skills) / len(req_skills) * 100) if req_skills else 100
    
    # Weighted overall match (marks 40%, attendance 30%, mock 20%, skills 10%)
    overall_match = (
        (marks_match * 0.4) +
        (attendance_match * 0.3) +
        (mock_match * 0.2) +
        (skills_match * 0.1)
    )
    
    gaps = []
    if student_marks < req_marks:
        gaps.append({
            "type": "marks",
            "current": round(student_marks, 2),
            "required": req_marks,
            "gap": round(req_marks - student_marks, 2),
        })
    
    if student_attendance < req_attendance:
        gaps.append({
            "type": "attendance",
            "current": round(student_attendance, 2),
            "required": req_attendance,
            "gap": round(req_attendance - student_attendance, 2),
        })
    
    if student_mock < req_mock:
        gaps.append({
            "type": "mock_score",
            "current": round(student_mock, 2),
            "required": req_mock,
            "gap": round(req_mock - student_mock, 2),
        })
    
    missing_skills = [s for s in req_skills if s.lower() not in student_skill_names]
    if missing_skills:
        gaps.append({
            "type": "skills",
            "missing": missing_skills,
            "have": [s.get("name") for s in student_skills if isinstance(s, dict)],
        })
    
    return {
        "match_score": round(overall_match, 1),
        "is_eligible": overall_match >= 75,
        "gaps": gaps,
        "matched_skills": matched_skills,
    }


def get_company_matches_for_student(student_id: int, institution_id=None) -> dict:
    """
    Get company matches for a student grouped by eligibility tier.
    
    Returns:
    {
        "eligible_now": [...],
        "eligible_with_improvement": [...],
        "stretch_targets": [...]
    }
    """
    if institution_id is not None and not get_student_profile(student_id, institution_id=institution_id):
        raise ValueError("Student not found")

    try:
        readiness = calculate_readiness(student_id, institution_id=institution_id)
        from services.skills_service import get_student_skills
        
        student_skills = get_student_skills(student_id)
        
        student_metrics = {
            "marks": readiness.get("marks", 0),
            "attendance": readiness.get("attendance", 0),
            "mock_score": readiness.get("mock_score", 0),
            "skills": student_skills,
        }
    except Exception as e:
        logger.error(f"Could not fetch student metrics: {e}")
        student_metrics = {"marks": 0, "attendance": 0, "mock_score": 0, "skills": []}
    
    with get_db_connection() as conn:
        ensure_companies_table_consistency(conn)
        
        with conn.cursor() as cur:
            cur.execute("SELECT id, name, min_marks_percentage, min_attendance, min_mock_score, package_lpa, sector, required_skills FROM placement_companies ORDER BY package_lpa DESC")
            companies = cur.fetchall()
    
    eligible_now = []
    eligible_with_improvement = []
    stretch_targets = []
    
    for company in companies:
        company_id, name, min_marks, min_att, min_mock, package, sector, req_skills = company
        
        company_req = {
            "min_marks_percentage": min_marks,
            "min_attendance": min_att,
            "min_mock_score": min_mock,
            "required_skills": req_skills or [],
        }
        
        match_result = calculate_company_match_score(student_metrics, company_req)
        match_score = match_result["match_score"]
        gaps = match_result["gaps"]
        
        company_dict = {
            "id": company_id,
            "name": name,
            "package": f"{package} LPA",
            "sector": sector,
            "match_score": match_score,
        }
        
        if match_score >= 90:
            eligible_now.append(company_dict)
        elif match_score >= 75:
            company_dict["gap"] = _format_gap_message(gaps, min_marks, min_att, min_mock)
            eligible_with_improvement.append(company_dict)
        else:
            company_dict["gap"] = _format_gap_message(gaps, min_marks, min_att, min_mock)
            stretch_targets.append(company_dict)
    
    return {
        "eligible_now": eligible_now,
        "eligible_with_improvement": eligible_with_improvement,
        "stretch_targets": stretch_targets,
    }


def _format_gap_message(gaps: list, min_marks, min_att, min_mock) -> str:
    """Format gaps into a human-readable message."""
    if not gaps:
        return "You match all criteria!"
    
    messages = []
    for gap in gaps:
        if gap["type"] == "marks":
            messages.append(f"Need {gap['gap']:.1f} more points in marks ({gap['current']:.1f}% → {gap['required']}%)")
        elif gap["type"] == "attendance":
            messages.append(f"Need {gap['gap']:.1f}% better attendance ({gap['current']:.1f}% → {gap['required']}%)")
        elif gap["type"] == "mock_score":
            messages.append(f"Need {gap['gap']:.1f} points in mock tests ({gap['current']:.1f} → {gap['required']})")
        elif gap["type"] == "skills":
            messages.append(f"Missing skills: {', '.join(gap['missing'])}")
    
    return ". ".join(messages[:2])  # Show top 2 gaps


def get_all_companies(connection=None) -> list[dict]:
    """Get all companies (for admin management)."""
    with _connection_scope(connection) as conn:
        ensure_companies_table_consistency(conn)
        
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, package_lpa, sector, min_marks_percentage, required_skills FROM placement_companies ORDER BY package_lpa DESC"
            )
            companies = cur.fetchall()
    
    return [
        {
            "id": row[0],
            "name": row[1],
            "package": row[2],
            "sector": row[3],
            "min_marks": row[4],
            "required_skills": row[5] or [],
        }
        for row in companies
    ]
