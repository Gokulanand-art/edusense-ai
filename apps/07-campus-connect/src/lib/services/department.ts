/**
 * Department analytics — the single-department read model for HOD and staff.
 *
 * Scoping rule (enforced, not advisory):
 *   every function here takes a `departmentId` and puts it in the WHERE clause of
 *   every table it touches. The id comes from the caller's session, never from a
 *   query string or request body. There is intentionally no "all departments"
 *   variant — cross-department reads belong to the admin surface, not here.
 *
 * What the HOD and a staff member share is the department boundary; what differs
 * is the second axis of scope. A staff member is additionally narrowed to the
 * subjects they own, because a department's HOD legitimately sees the whole
 * department while an individual lecturer's accountability is their own papers.
 */
import { getDb, type QueryFn } from "@/lib/db";

export interface DeptKpis {
  students: number;
  avgAttendance: number;
  atRisk: number;
  blockedSubjects: number;
  pendingLeaves: number;
  avgCgpa: number;
  /** students eligible to sit every exam they are registered for */
  fullyEligible: number;
}

/**
 * Department KPIs. `subjectIds` narrows every attendance-derived figure to a
 * lecturer's own papers — without it a faculty page labelled "my papers" would
 * silently show the whole department's number.
 */
export async function deptKpis(
  departmentId: string,
  subjectIds?: string[] | null,
  q?: QueryFn,
): Promise<DeptKpis> {
  const run: QueryFn = q ?? (await getDb()).query;

  // Students in the department, with their department-wide attendance rollup.
  // Attendance is joined through the subject's department so a student's
  // attendance in another department's subject is not counted here.
  const { rows } = await run<any>(
    `WITH scoped AS (
       SELECT s.id
         FROM students s
        WHERE s.department_id = $1 AND s.is_active
     ),
     roll AS (
       SELECT v.student_id,
              SUM(v.held)      AS held,
              SUM(v.attended)  AS attended,
              SUM(CASE WHEN v.is_below_threshold THEN 1 ELSE 0 END) AS below_n
         FROM v_attendance_status v
         JOIN scoped sc ON sc.id = v.student_id
         JOIN subjects sub ON sub.id = v.subject_id
        WHERE sub.department_id = $1
          AND ($2::text[] IS NULL OR v.subject_id = ANY($2))
        GROUP BY v.student_id
     )
     SELECT
       (SELECT COUNT(*)::int FROM scoped)                              AS students,
       COALESCE(ROUND(AVG(100.0 * attended / NULLIF(held,0)), 2), 0)  AS avg_attendance,
       COUNT(*) FILTER (WHERE held > 0
                          AND 100.0 * attended / held < 75)::int        AS at_risk,
       COALESCE(SUM(below_n), 0)::int                                  AS blocked_subjects,
       COUNT(*) FILTER (WHERE below_n = 0 AND held > 0)::int            AS fully_eligible
       FROM roll`,
    [departmentId, subjectIds ?? null],
  );

  const attendance = await run<any>(
    `SELECT COALESCE(ROUND(AVG(v.effective_percentage), 2), 0) AS avg_pct
       FROM v_attendance_status v
       JOIN subjects sub ON sub.id = v.subject_id
       JOIN students s   ON s.id = v.student_id
      WHERE sub.department_id = $1 AND s.department_id = $1
        AND ($2::text[] IS NULL OR v.subject_id = ANY($2))`,
    [departmentId, subjectIds ?? null],
  );

  const cgpa = await run<any>(
    `SELECT COALESCE(ROUND(AVG(c.cgpa), 2), 0) AS avg_cgpa
       FROM cgpa_records c
       JOIN students s ON s.id = c.student_id
      WHERE s.department_id = $1`,
    [departmentId],
  );

  const leaves = await run<any>(
    `SELECT COUNT(*)::int AS n
       FROM leaves l
       JOIN students s ON s.id = l.student_id
      WHERE s.department_id = $1 AND l.status = 'PENDING'`,
    [departmentId],
  );

  const r = rows[0] ?? {};
  return {
    students: Number(r.students ?? 0),
    avgAttendance: Number(attendance.rows[0]?.avg_pct ?? 0),
    atRisk: Number(r.at_risk ?? 0),
    blockedSubjects: Number(r.blocked_subjects ?? 0),
    fullyEligible: Number(r.fully_eligible ?? 0),
    pendingLeaves: Number(leaves.rows[0]?.n ?? 0),
    avgCgpa: Number(cgpa.rows[0]?.avg_cgpa ?? 0),
  };
}

export interface DeptSubjectStat {
  subjectId: string;
  code: string;
  name: string;
  credits: number;
  students: number;
  avgAttendance: number;
  atRisk: number;
  avgMarks: number;
  passRate: number;
}

/** Subject-wise rollup within the department. */
export async function deptSubjects(
  departmentId: string,
  subjectIds?: string[] | null,
  q?: QueryFn,
): Promise<DeptSubjectStat[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT sub.id AS subject_id, sub.code, sub.name, sub.credits,
            COUNT(DISTINCT v.student_id)::int                          AS students,
            COALESCE(ROUND(AVG(v.percentage), 2), 0)                   AS avg_attendance,
            COUNT(*) FILTER (WHERE v.is_below_threshold)::int          AS at_risk,
            COALESCE(ROUND(AVG(100.0 * (m.internal_marks + m.external_marks)
                              / NULLIF(m.internal_max + m.external_max, 0)), 2), 0) AS avg_marks,
            COALESCE(ROUND(100.0 * COUNT(*) FILTER (
                WHERE 100.0 * (m.internal_marks + m.external_marks)
                    / NULLIF(m.internal_max + m.external_max, 0) >= 40)
                / NULLIF(COUNT(m.id), 0), 2), 0)                     AS pass_rate
       FROM subjects sub
       LEFT JOIN v_attendance_status v ON v.subject_id = sub.id
       LEFT JOIN students s            ON s.id = v.student_id AND s.department_id = $1
       LEFT JOIN marks m               ON m.student_id = s.id AND m.subject_id = sub.id
      WHERE sub.department_id = $1
        AND ($2::text[] IS NULL OR sub.id = ANY($2))
      GROUP BY sub.id, sub.code, sub.name, sub.credits
      ORDER BY sub.code`,
    [departmentId, subjectIds ?? null],
  );

  return rows.map((r) => ({
    subjectId: r.subject_id,
    code: r.code,
    name: r.name,
    credits: Number(r.credits),
    students: Number(r.students ?? 0),
    avgAttendance: Number(r.avg_attendance ?? 0),
    atRisk: Number(r.at_risk ?? 0),
    avgMarks: Number(r.avg_marks ?? 0),
    passRate: Number(r.pass_rate ?? 0),
  }));
}

export interface AtRiskStudent {
  studentId: string;
  name: string;
  rollNumber: string;
  branch: string;
  overall: number;
  belowSubjects: number;
  worst: { code: string; pct: number } | null;
  cgpa: number | null;
  severity: 'CRITICAL' | 'HIGH' | 'WATCH';
}

/** At-risk watchlist, worst-first. Optional subjectIds narrows to a lecturer's papers. */
export async function deptAtRisk(
  departmentId: string,
  subjectIds?: string[] | null,
  q?: QueryFn,
): Promise<AtRiskStudent[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `WITH scoped AS (
       SELECT s.id, s.roll_number, d.code AS branch,
              u.first_name || ' ' || u.last_name AS name
         FROM students s
         JOIN users u       ON u.id = s.user_id
         JOIN departments d ON d.id = s.department_id
        WHERE s.department_id = $1 AND s.is_active
     ),
     roll AS (
       SELECT v.student_id,
              COUNT(*) FILTER (WHERE v.is_below_threshold)::int AS below_n,
              MIN(v.percentage)                                   AS worst_pct,
              ROUND(AVG(v.percentage), 2)                        AS overall
         FROM v_attendance_status v
         JOIN scoped sc ON sc.id = v.student_id
         JOIN subjects sub ON sub.id = v.subject_id
        WHERE sub.department_id = $1
          AND ($2::text[] IS NULL OR v.subject_id = ANY($2))
        GROUP BY v.student_id
     ),
     cg AS (
       SELECT DISTINCT ON (student_id) student_id, cgpa
         FROM cgpa_records
        WHERE student_id IN (SELECT id FROM scoped)
        ORDER BY student_id, semester DESC
     ),
     worst_sub AS (
       SELECT DISTINCT ON (v.student_id) v.student_id, sub.code, v.percentage
         FROM v_attendance_status v
         JOIN subjects sub ON sub.id = v.subject_id
         JOIN scoped sc ON sc.id = v.student_id
        WHERE sub.department_id = $1
          AND ($2::text[] IS NULL OR v.subject_id = ANY($2))
        ORDER BY v.student_id, v.percentage ASC
     )
     SELECT sc.*, r.overall, r.below_n, r.worst_pct, ws.code AS worst_code,
            cg.cgpa
       FROM scoped sc
       JOIN roll r ON r.student_id = sc.id
       LEFT JOIN cg  cg ON cg.student_id = sc.id
       LEFT JOIN worst_sub ws ON ws.student_id = sc.id
      WHERE r.overall < 85
      ORDER BY r.overall ASC
      LIMIT 60`,
    [departmentId, subjectIds ?? null],
  );

  return rows.map((r) => {
    const overall = Number(r.overall);
    return {
      studentId: r.id,
      name: r.name,
      rollNumber: r.roll_number,
      branch: r.branch,
      overall,
      belowSubjects: Number(r.below_n),
      worst: r.worst_code
        ? { code: String(r.worst_code), pct: Number(r.worst_pct) }
        : null,
      cgpa: r.cgpa == null ? null : Number(r.cgpa),
      severity:
        overall < 60 ? ("CRITICAL" as const) : overall < 75 ? ("HIGH" as const) : ("WATCH" as const),
    };
  });
}

export interface DeptLeaveRow {
  id: string;
  studentId: string;
  studentName: string;
  rollNumber: string;
  branch: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  noOfDays: number;
  reason: string;
  status: string;
  hasMedicalCert: boolean;
  appliedAt: string;
  /** the student's department-wide attendance at the moment they applied */
  projectedOverall: number | null;
  riskLevel: string | null;
}

/**
 * Leave queue for the department, with the impact snapshot the student saw.
 * PENDING first so the actionable rows are on top.
 */
export async function deptLeaves(
  departmentId: string,
  status: string | undefined,
  q?: QueryFn,
): Promise<DeptLeaveRow[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    // Dates are formatted in SQL on purpose. PGlite hands back a pre-rendered
    // string ("Thu Oct 15") while node-postgres returns a Date, so slicing the
    // raw value produced "Thu Oct 15" — and `new Date("Thu Oct 15")` resolves
    // to 2001. to_char makes the shape identical on both drivers.
    `SELECT l.id, l.student_id, l.leave_type,
            to_char(l.start_date, 'YYYY-MM-DD') AS start_date,
            to_char(l.end_date, 'YYYY-MM-DD') AS end_date,
            l.no_of_days, l.reason, l.status, l.has_medical_cert,
            to_char(l.applied_at, 'YYYY-MM-DD"T"HH24:MI') AS applied_at,
            l.impact_snapshot,
            s.roll_number, d.code AS branch,
            u.first_name || ' ' || u.last_name AS student_name
       FROM leaves l
       JOIN students s    ON s.id = l.student_id
       JOIN users u       ON u.id = s.user_id
       JOIN departments d ON d.id = s.department_id
      WHERE s.department_id = $1
        AND ($2::text IS NULL OR l.status = $2)
      ORDER BY CASE l.status WHEN 'PENDING' THEN 0 ELSE 1 END, l.applied_at DESC
      LIMIT 80`,
    [departmentId, status ?? null],
  );

  return rows.map((r) => {
    let projected: number | null = null;
    let risk: string | null = null;
    if (r.impact_snapshot && typeof r.impact_snapshot === 'object') {
      projected = r.impact_snapshot.overallProjected ?? null;
      risk = r.impact_snapshot.riskLevel ?? null;
    }
    return {
      id: r.id,
      studentId: r.student_id,
      studentName: r.student_name,
      rollNumber: r.roll_number,
      branch: r.branch,
      leaveType: r.leave_type,
      startDate: String(r.start_date).slice(0, 10),
      endDate: String(r.end_date).slice(0, 10),
      noOfDays: Number(r.no_of_days),
      reason: r.reason,
      status: r.status,
      hasMedicalCert: Boolean(r.has_medical_cert),
      appliedAt: String(r.applied_at).slice(0, 16).replace('T', ' '),
      projectedOverall: projected == null ? null : Number(projected),
      riskLevel: risk,
    };
  });
}

export interface DeptTrendPoint {
  week: string;
  overall: number;
}

/** Weekly department attendance trend over the trailing window. */
export async function deptTrend(
  departmentId: string,
  weeks = 8,
  subjectIds?: string[] | null,
  q?: QueryFn,
): Promise<DeptTrendPoint[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT to_char(date_trunc('week', a.class_date), 'YYYY-MM-DD') AS week,
            ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))
                  / NULLIF(COUNT(*), 0), 2) AS overall
       FROM attendance a
       JOIN students s   ON s.id = a.student_id AND s.department_id = $1
       JOIN subjects sub ON sub.id = a.subject_id AND sub.department_id = $1
      WHERE a.class_date >= CURRENT_DATE - ($2::int * 7)
        AND ($3::text[] IS NULL OR a.subject_id = ANY($3))
      GROUP BY 1
      ORDER BY 1`,
    [departmentId, weeks, subjectIds ?? null],
  );
  return rows.map((r) => ({ week: String(r.week), overall: Number(r.overall) }));
}

/* ---------------------------------------------------------------- faculty axis */

/** Subjects a lecturer actually owns — the second scope axis for staff. */
export async function facultySubjects(
  facultyId: string,
  q?: QueryFn,
): Promise<Array<{ subjectId: string; code: string; name: string; credits: number; isPrimary: boolean }>> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT sub.id AS subject_id, sub.code, sub.name, sub.credits, sf.is_primary
       FROM subject_faculty sf
       JOIN subjects sub ON sub.id = sf.subject_id
      WHERE sf.faculty_id = $1
      ORDER BY sub.code`,
    [facultyId],
  );
  return rows.map((r) => ({
    subjectId: r.subject_id,
    code: r.code,
    name: r.name,
    credits: Number(r.credits),
    isPrimary: Boolean(r.is_primary),
  }));
}

export interface DeptFacultyMember {
  facultyId: string;
  name: string;
  employeeId: string;
  designation: string;
  email: string;
  subjects: number;
  isHod: boolean;
}

export async function deptFaculty(departmentId: string, q?: QueryFn): Promise<DeptFacultyMember[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT f.id AS faculty_id, f.employee_id, f.designation,
            u.first_name || ' ' || u.last_name AS name, u.email,
            (d.hod_user_id = u.id) AS is_hod,
            (SELECT COUNT(*)::int FROM subject_faculty sf
               JOIN subjects sub ON sub.id = sf.subject_id
              WHERE sf.faculty_id = f.id AND sub.department_id = $1) AS subjects
       FROM faculty f
       JOIN users u ON u.id = f.user_id
       LEFT JOIN departments d ON d.id = f.department_id
      WHERE f.department_id = $1 AND f.is_active
      ORDER BY is_hod DESC, name`,
    [departmentId],
  );
  return rows.map((r) => ({
    facultyId: r.faculty_id,
    name: r.name,
    employeeId: r.employee_id,
    designation: r.designation,
    email: r.email,
    subjects: Number(r.subjects),
    isHod: Boolean(r.is_hod),
  }));
}

/* ------------------------------------------------------------------ coverage */

/**
 * Sanity check used by tests and surfaced in the UI: does this department's
 * student count equal the sum across its own subjects? Catches a scoping bug
 * where a query dropped the department predicate.
 */
export async function deptCoverage(
  departmentId: string,
  q?: QueryFn,
): Promise<{ students: number; withAttendance: number; strays: number }> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT
       (SELECT COUNT(*)::int FROM students WHERE department_id = $1 AND is_active) AS students,
       (SELECT COUNT(DISTINCT a.student_id)::int
          FROM attendance a
          JOIN students s   ON s.id = a.student_id
          JOIN subjects sub ON sub.id = a.subject_id
         WHERE s.department_id = $1 AND sub.department_id = $1) AS with_attendance,
       -- attendance rows whose student is NOT in this department: must be 0
       (SELECT COUNT(*)::int
          FROM attendance a
          JOIN students s ON s.id = a.student_id
         WHERE s.department_id <> $1 AND a.subject_id IN
               (SELECT id FROM subjects WHERE department_id = $1)) AS strays`,
    [departmentId],
  );
  const r = rows[0] ?? {};
  return {
    students: Number(r.students ?? 0),
    withAttendance: Number(r.with_attendance ?? 0),
    strays: Number(r.strays ?? 0),
  };
}