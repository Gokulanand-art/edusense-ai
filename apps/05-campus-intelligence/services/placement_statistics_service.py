"""
Placement Statistics Service
==============================
Aggregates placement outcomes into the metrics that campus placement cells
actually care about:

  - placement rate (how many students got at least one offer)
  - average / median / highest package
  - company-wise offer breakdown
  - department-wise placement rates
  - monthly placement trend (offers over time)
  - skill-demand heatmap (which skills appear most in placed students)

Data flows IN  →  placement_outcomes (recorded by Admin or Student)
Data flows OUT →  placement_dashboard (Admin), student profile (own outcomes)
"""

import logging
from contextlib import nullcontext
from database import get_db_connection

logger = logging.getLogger(__name__)

_OUTCOMES_SCHEMA_READY = False


def _conn(connection=None):
    if connection is not None:
        return nullcontext(connection)
    return get_db_connection()


def ensure_outcomes_tables(connection=None):
    """Ensure placement_outcomes and placement_drives tables exist (idempotent)."""
    global _OUTCOMES_SCHEMA_READY
    if _OUTCOMES_SCHEMA_READY:
        return

    with _conn(connection) as conn:
        with conn.cursor() as cur:
            # Minimal guard — migration 016 creates the tables fully.
            # This is a safety net for services called before migrations finish.
            cur.execute("""
                CREATE TABLE IF NOT EXISTS placement_outcomes (
                    id              SERIAL PRIMARY KEY,
                    student_id      INTEGER NOT NULL,
                    company_id      INTEGER,
                    company_name    TEXT NOT NULL,
                    package_lpa     DECIMAL(6,2) NOT NULL,
                    role_title      TEXT,
                    offer_type      VARCHAR(20) DEFAULT 'full_time',
                    status          VARCHAR(20) DEFAULT 'offered',
                    offer_date      DATE NOT NULL DEFAULT CURRENT_DATE,
                    joining_date    DATE,
                    institution_id  INTEGER NOT NULL,
                    recorded_by     INTEGER,
                    notes           TEXT,
                    created_at      TIMESTAMPTZ DEFAULT now(),
                    updated_at      TIMESTAMPTZ DEFAULT now()
                )
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS placement_drives (
                    id              SERIAL PRIMARY KEY,
                    company_id      INTEGER,
                    company_name    TEXT NOT NULL,
                    drive_date      DATE NOT NULL,
                    drive_type      VARCHAR(20) DEFAULT 'on_campus',
                    departments     TEXT[],
                    min_cgpa        DECIMAL(3,2),
                    roles_offered   TEXT[],
                    packages_offered TEXT,
                    total_selected  INTEGER DEFAULT 0,
                    institution_id  INTEGER NOT NULL,
                    conducted_by    INTEGER,
                    notes           TEXT,
                    created_at      TIMESTAMPTZ DEFAULT now()
                )
            """)
    _OUTCOMES_SCHEMA_READY = True


# ── WRITE operations ──────────────────────────────────────────────────────────

def record_placement_outcome(
    *,
    student_id: int,
    company_name: str,
    package_lpa: float,
    institution_id: int,
    recorded_by: int,
    role_title: str = None,
    offer_type: str = "full_time",
    status: str = "offered",
    offer_date: str = None,
    joining_date: str = None,
    company_id: int = None,
    drive_id: int = None,
    notes: str = None,
) -> dict:
    """Record a new placement outcome. Returns the created record."""
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO placement_outcomes
                    (student_id, company_id, company_name, package_lpa, role_title,
                     offer_type, status, offer_date, joining_date, institution_id,
                     recorded_by, notes, drive_id)
                VALUES (%s, %s, %s, %s, %s,
                        %s, %s, COALESCE(%s::date, CURRENT_DATE), %s::date, %s,
                        %s, %s, %s)
                RETURNING id, created_at
            """, (
                student_id, company_id, company_name, package_lpa, role_title,
                offer_type, status, offer_date, joining_date, institution_id,
                recorded_by, notes, drive_id,
            ))
            row = cur.fetchone()
    return {"id": row[0], "created_at": str(row[1])}


def update_outcome_status(outcome_id: int, status: str, institution_id: int) -> bool:
    """Update status of an existing outcome (offered → accepted → joined)."""
    valid = {"offered", "accepted", "declined", "joined"}
    if status not in valid:
        raise ValueError(f"Invalid status: {status}")
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE placement_outcomes
                SET status = %s, updated_at = now()
                WHERE id = %s AND institution_id = %s
            """, (status, outcome_id, institution_id))
            return cur.rowcount > 0


def record_placement_drive(
    *,
    company_name: str,
    drive_date: str,
    institution_id: int,
    conducted_by: int,
    company_id: int = None,
    drive_type: str = "on_campus",
    departments: list = None,
    min_cgpa: float = None,
    roles_offered: list = None,
    packages_offered: str = None,
    notes: str = None,
) -> dict:
    """Record a campus placement drive event."""
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO placement_drives
                    (company_id, company_name, drive_date, drive_type, departments,
                     min_cgpa, roles_offered, packages_offered, institution_id,
                     conducted_by, notes)
                VALUES (%s, %s, %s::date, %s, %s,
                        %s, %s, %s, %s,
                        %s, %s)
                RETURNING id, created_at
            """, (
                company_id, company_name, drive_date, drive_type, departments or [],
                min_cgpa, roles_offered or [], packages_offered, institution_id,
                conducted_by, notes,
            ))
            row = cur.fetchone()
    return {"id": row[0], "created_at": str(row[1])}


# ── READ: student-level ───────────────────────────────────────────────────────

def get_student_outcomes(student_id: int, institution_id: int) -> list:
    """Get all placement outcomes for a specific student."""
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT po.id, po.company_name, po.package_lpa, po.role_title,
                       po.offer_type, po.status, po.offer_date, po.joining_date,
                       po.notes, po.created_at
                FROM placement_outcomes po
                WHERE po.student_id = %s AND po.institution_id = %s
                ORDER BY po.offer_date DESC
            """, (student_id, institution_id))
            rows = cur.fetchall()
    return [
        {
            "id": r[0], "company_name": r[1], "package_lpa": float(r[2] or 0),
            "role_title": r[3], "offer_type": r[4], "status": r[5],
            "offer_date": str(r[6]) if r[6] else None,
            "joining_date": str(r[7]) if r[7] else None,
            "notes": r[8], "created_at": str(r[9]),
        }
        for r in rows
    ]


# ── READ: institution-level stats ─────────────────────────────────────────────

def get_placement_summary(institution_id: int) -> dict:
    """
    Top-level placement KPIs for the admin placement dashboard.
    Returns: total_students, placed_students, placement_rate, avg_package,
             max_package, median_package, total_offers, companies_visited
    """
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            # Total active students
            cur.execute(
                "SELECT COUNT(*) FROM students WHERE institution_id = %s",
                (institution_id,)
            )
            total_students = cur.fetchone()[0] or 0

            # Placement metrics (accepted/joined = firmly placed)
            cur.execute("""
                SELECT
                    COUNT(DISTINCT student_id)                         AS placed_students,
                    COUNT(*)                                           AS total_offers,
                    ROUND(AVG(package_lpa)::NUMERIC, 2)               AS avg_package,
                    MAX(package_lpa)                                   AS max_package,
                    PERCENTILE_CONT(0.5) WITHIN GROUP
                        (ORDER BY package_lpa)                         AS median_package,
                    COUNT(DISTINCT company_name)                       AS companies_count
                FROM placement_outcomes
                WHERE institution_id = %s
                  AND status IN ('accepted', 'joined', 'offered')
            """, (institution_id,))
            row = cur.fetchone()

            placed   = row[0] or 0
            offers   = row[1] or 0
            avg_pkg  = float(row[2] or 0)
            max_pkg  = float(row[3] or 0)
            med_pkg  = float(row[4] or 0)
            companies = row[5] or 0

            # Drives count this year
            cur.execute("""
                SELECT COUNT(*) FROM placement_drives
                WHERE institution_id = %s
                  AND drive_date >= DATE_TRUNC('year', CURRENT_DATE)
            """, (institution_id,))
            drives_this_year = cur.fetchone()[0] or 0

    placement_rate = round(placed / total_students * 100, 1) if total_students else 0

    return {
        "total_students":   total_students,
        "placed_students":  placed,
        "placement_rate":   placement_rate,
        "total_offers":     offers,
        "avg_package":      avg_pkg,
        "max_package":      max_pkg,
        "median_package":   med_pkg,
        "companies_visited": companies,
        "drives_this_year": drives_this_year,
        "unplaced_students": total_students - placed,
    }


def get_department_placement_rates(institution_id: int) -> list:
    """
    Per-department breakdown: total students, placed, placement rate, avg package.
    Used for the dept-wise bar chart on the placement dashboard.
    """
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                WITH dept_students AS (
                    SELECT department, COUNT(*) AS total
                    FROM students
                    WHERE institution_id = %s AND department IS NOT NULL
                    GROUP BY department
                ),
                dept_placed AS (
                    SELECT s.department,
                           COUNT(DISTINCT po.student_id) AS placed,
                           ROUND(AVG(po.package_lpa)::NUMERIC, 2) AS avg_pkg,
                           MAX(po.package_lpa) AS max_pkg
                    FROM placement_outcomes po
                    JOIN students s ON s.id = po.student_id
                    WHERE po.institution_id = %s
                      AND po.status IN ('accepted', 'joined', 'offered')
                    GROUP BY s.department
                )
                SELECT ds.department,
                       ds.total,
                       COALESCE(dp.placed, 0) AS placed,
                       COALESCE(dp.avg_pkg, 0) AS avg_pkg,
                       COALESCE(dp.max_pkg, 0) AS max_pkg,
                       ROUND(COALESCE(dp.placed, 0) * 100.0 / NULLIF(ds.total, 0), 1) AS rate
                FROM dept_students ds
                LEFT JOIN dept_placed dp ON dp.department = ds.department
                ORDER BY rate DESC NULLS LAST
            """, (institution_id, institution_id))
            rows = cur.fetchall()

    return [
        {
            "department": r[0], "total": r[1], "placed": r[2],
            "avg_package": float(r[3] or 0), "max_package": float(r[4] or 0),
            "placement_rate": float(r[5] or 0),
        }
        for r in rows
    ]


def get_company_placement_breakdown(institution_id: int, limit: int = 15) -> list:
    """
    Per-company offer count and average package — for the donut/bar chart.
    """
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT company_name,
                       COUNT(*)                              AS offers,
                       COUNT(DISTINCT student_id)           AS students,
                       ROUND(AVG(package_lpa)::NUMERIC, 2)  AS avg_pkg,
                       MAX(package_lpa)                     AS max_pkg
                FROM placement_outcomes
                WHERE institution_id = %s
                  AND status IN ('accepted', 'joined', 'offered')
                GROUP BY company_name
                ORDER BY offers DESC, avg_pkg DESC
                LIMIT %s
            """, (institution_id, limit))
            rows = cur.fetchall()

    return [
        {
            "company": r[0], "offers": r[1], "students": r[2],
            "avg_package": float(r[3] or 0), "max_package": float(r[4] or 0),
        }
        for r in rows
    ]


def get_monthly_placement_trend(institution_id: int, months: int = 12) -> list:
    """
    Monthly offer count for the past N months — for the trend line chart.
    """
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT TO_CHAR(DATE_TRUNC('month', offer_date), 'Mon YYYY') AS month,
                       DATE_TRUNC('month', offer_date)                       AS month_date,
                       COUNT(*)                                              AS offers,
                       COUNT(DISTINCT student_id)                           AS students
                FROM placement_outcomes
                WHERE institution_id = %s
                  AND offer_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '%s months'
                  AND status IN ('accepted', 'joined', 'offered')
                GROUP BY DATE_TRUNC('month', offer_date)
                ORDER BY month_date ASC
            """, (institution_id, months))
            rows = cur.fetchall()

    return [
        {"month": r[0], "offers": r[2], "students": r[3]}
        for r in rows
    ]


def get_package_distribution(institution_id: int) -> dict:
    """
    Package bands: how many students in each LPA bracket.
    Bands: <4, 4-6, 6-8, 8-12, 12+
    """
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) FILTER (WHERE package_lpa < 4)                  AS lt4,
                    COUNT(*) FILTER (WHERE package_lpa >= 4 AND package_lpa < 6)  AS b4_6,
                    COUNT(*) FILTER (WHERE package_lpa >= 6 AND package_lpa < 8)  AS b6_8,
                    COUNT(*) FILTER (WHERE package_lpa >= 8 AND package_lpa < 12) AS b8_12,
                    COUNT(*) FILTER (WHERE package_lpa >= 12)                AS gte12
                FROM placement_outcomes
                WHERE institution_id = %s
                  AND status IN ('accepted', 'joined', 'offered')
            """, (institution_id,))
            row = cur.fetchone()

    return {
        "< 4 LPA": row[0] or 0,
        "4–6 LPA": row[1] or 0,
        "6–8 LPA": row[2] or 0,
        "8–12 LPA": row[3] or 0,
        "12+ LPA": row[4] or 0,
    }


def get_recent_placements(institution_id: int, limit: int = 20) -> list:
    """Recent placement outcomes with student name for the activity feed."""
    ensure_outcomes_tables()
    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT po.id,
                       COALESCE(NULLIF(s.name,''), u.name, 'Student') AS student_name,
                       s.department,
                       po.company_name,
                       po.package_lpa,
                       po.role_title,
                       po.status,
                       po.offer_date
                FROM placement_outcomes po
                JOIN students s ON s.id = po.student_id
                LEFT JOIN users u ON u.id = s.user_id
                WHERE po.institution_id = %s
                ORDER BY po.offer_date DESC, po.created_at DESC
                LIMIT %s
            """, (institution_id, limit))
            rows = cur.fetchall()

    return [
        {
            "id": r[0], "student_name": r[1], "department": r[2],
            "company_name": r[3], "package_lpa": float(r[4] or 0),
            "role_title": r[5], "status": r[6],
            "offer_date": str(r[7]) if r[7] else None,
        }
        for r in rows
    ]


def get_full_placement_stats(institution_id: int) -> dict:
    """Aggregates all stats into one dict for the placement dashboard."""
    return {
        "summary": get_placement_summary(institution_id),
        "by_department": get_department_placement_rates(institution_id),
        "by_company": get_company_placement_breakdown(institution_id),
        "monthly_trend": get_monthly_placement_trend(institution_id),
        "package_distribution": get_package_distribution(institution_id),
        "recent": get_recent_placements(institution_id, limit=10),
    }
