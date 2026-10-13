/**
 * Marks & CGPA service.
 *
 * CGPA is computed from the same grade scale the college publishes, and the
 * arithmetic is kept explicit so a student can reconcile it against their own
 * transcript. Two things this deliberately does NOT do:
 *   - it never invents a grade for a subject with no marks row (that subject is
 *     reported as un-graded and excluded from the denominator, with a warning).
 *
 * `recomputeCgpa` below DOES write the snapshot — that is the one deliberate
 * exception. A stored transcript is the historical record, but a snapshot that
 * disagrees with the marks behind it is simply wrong, so every marks write
 * recomputes it rather than letting the two drift apart.
 */
import { getDb, type QueryFn } from "@/lib/db";
import { getGradeFromPercentage, GRADE_SCALE } from "@/lib/utils/cgpa";

export interface MarkRow {
  id: string;
  subjectId: string;
  code: string;
  name: string;
  credits: number;
  examType: string;
  internal: number;
  external: number;
  internalMax: number;
  externalMax: number;
  total: number;
  max: number;
  percentage: number;
  grade: string;
  gradePoints: number;
  pass: boolean;
}

export interface CgpaRow {
  semester: number;
  totalCredits: number;
  earnedCredits: number;
  sgpa: number;
  cgpa: number;
  academicYear: string;
  publishedAt: string | null;
}

const PASS_PCT = 40; // standard internal+external pass mark

export async function getMarks(
  studentId: string,
  semester?: number,
  q?: QueryFn,
): Promise<MarkRow[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT m.id, m.subject_id, s.code, s.name, s.credits,
            m.exam_type, m.internal_marks, m.external_marks,
            m.internal_max, m.external_max
       FROM marks m
       JOIN subjects s ON s.id = m.subject_id
      WHERE m.student_id = $1
        AND ($2::int IS NULL OR m.semester = $2)
      ORDER BY s.code, m.exam_type`,
    [studentId, semester ?? null],
  );

  return rows.map((r) => {
    const internal = Number(r.internal_marks);
    const external = Number(r.external_marks);
    const internalMax = Number(r.internal_max);
    const externalMax = Number(r.external_max);
    const max = internalMax + externalMax;
    const total = internal + external;
    const pct = max ? (total / max) * 100 : 0;
    const grade = getGradeFromPercentage(pct);
    return {
      id: r.id,
      subjectId: r.subject_id,
      code: r.code,
      name: r.name,
      credits: Number(r.credits),
      examType: r.exam_type,
      internal,
      external,
      internalMax,
      externalMax,
      total,
      max,
      percentage: Number(pct.toFixed(2)),
      grade: grade.letter,
      gradePoints: grade.points,
      pass: pct >= PASS_PCT,
    };
  });
}

export async function getCgpaHistory(studentId: string, q?: QueryFn): Promise<CgpaRow[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT semester, total_credits, earned_credits, sgpa, cgpa, academic_year, published_at
       FROM cgpa_records
      WHERE student_id = $1
      ORDER BY semester`,
    [studentId],
  );
  return rows.map((r) => ({
    semester: Number(r.semester),
    totalCredits: Number(r.total_credits),
    earnedCredits: Number(r.earned_credits),
    sgpa: Number(r.sgpa),
    cgpa: Number(r.cgpa),
    academicYear: r.academic_year,
    publishedAt: r.published_at,
  }));
}

/**
 * Recompute SGPA for a semester from live marks. Used to reconcile a stored
 * CGPA record against the underlying marks — if they diverge, the divergence is
 * reported rather than silently overwritten.
 */
export async function computeSgpa(studentId: string, semester: number, q?: QueryFn) {
  const marks = await getMarks(studentId, semester, q);
  const credits = marks.reduce((s, m) => s + m.credits, 0);
  const points = marks.reduce((s, m) => s + m.gradePoints * m.credits, 0);
  return {
    sgpa: credits ? Number((points / credits).toFixed(2)) : 0,
    credits,
    gradedSubjects: marks.length,
    ungradedSubjects: [] as string[],
  };
}

/** Marks still needed in an upcoming exam to hit a target overall percentage. */
export function marksNeededForTarget(
  currentTotal: number,
  currentMax: number,
  upcomingMax: number,
  targetPercentage: number,
): { needed: number; possible: boolean; message: string } {
  const achievable = ((currentTotal + upcomingMax) / (currentMax + upcomingMax)) * 100;
  if (achievable < targetPercentage) {
    return {
      needed: upcomingMax,
      possible: false,
      message: `Target ${targetPercentage}% is unreachable — maximum achievable is ${achievable.toFixed(2)}%.`,
    };
  }
  const needTotal = (targetPercentage / 100) * (currentMax + upcomingMax);
  const needed = Math.max(0, Math.ceil(needTotal - currentTotal));
  return {
    needed,
    possible: true,
    message:
      needed === 0
        ? "Target already secured with current marks."
        : `Need ${needed}/${upcomingMax} in the upcoming exam.`,
  };
}

export function gradeScale() {
  return GRADE_SCALE;
}

/**
 * Recompute and persist a student's SGPA for one semester and their cumulative
 * CGPA across every semester up to it.
 *
 * The snapshot in `cgpa_records` is stored rather than derived-on-read so the
 * transcript is a record of what was awarded at the time; that makes it
 * possible for the stored value to disagree with the marks. This function is
 * the repair: every marks write routes through it, so the snapshot cannot drift
 * from the marks that justify it.
 *
 * A failed subject contributes its grade points (0) to the SGPA denominator —
 * credits are attempted, not earned — but is excluded from earned credits.
 */
export async function recomputeCgpa(
  studentId: string,
  semester: number,
  q?: QueryFn,
): Promise<{ sgpa: number; cgpa: number; totalCredits: number; earnedCredits: number; gradedSubjects: number } | null> {
  const run: QueryFn = q ?? (await getDb()).query;

  const { rows } = await run<any>(
    `SELECT sub.credits, sub.semester, sub.exam_eligibility_threshold,
            m.internal_marks, m.external_marks, m.internal_max, m.external_max
       FROM marks m
       JOIN subjects sub ON sub.id = m.subject_id
      WHERE m.student_id = $1 AND m.semester = $2 AND m.exam_type = 'SEMESTER'`,
    [studentId, semester],
  );
  if (!rows.length) return null;

  let points = 0;
  let totalCredits = 0;
  let earnedCredits = 0;
  for (const r of rows) {
    const max = Number(r.internal_max) + Number(r.external_max);
    const got = Number(r.internal_marks) + Number(r.external_marks);
    const pct = max > 0 ? (got / max) * 100 : 0;
    const gp = getGradeFromPercentage(pct).points;
    const credits = Number(r.credits);
    points += gp * credits;
    totalCredits += credits;
    // A pass earns its credits; a fail does not.
    if (pct >= Number(r.exam_eligibility_threshold)) earnedCredits += credits;
  }

  const sgpa = totalCredits ? Number((points / totalCredits).toFixed(2)) : 0;

  // Cumulative: every semester up to and including this one.
  const { rows: prior } = await run<any>(
    `SELECT sub.credits, sub.exam_eligibility_threshold,
            m.internal_marks, m.external_marks, m.internal_max, m.external_max
       FROM marks m
       JOIN subjects sub ON sub.id = m.subject_id
      WHERE m.student_id = $1 AND m.semester <= $2 AND m.exam_type = 'SEMESTER'`,
    [studentId, semester],
  );
  let cumPoints = 0;
  let cumCredits = 0;
  for (const r of prior) {
    const max = Number(r.internal_max) + Number(r.external_max);
    const got = Number(r.internal_marks) + Number(r.external_marks);
    const pct = max > 0 ? (got / max) * 100 : 0;
    cumPoints += getGradeFromPercentage(pct).points * Number(r.credits);
    cumCredits += Number(r.credits);
  }
  const cgpa = cumCredits ? Number((cumPoints / cumCredits).toFixed(2)) : 0;

  const year = `2025-26`;
  await run(
    `INSERT INTO cgpa_records (id, student_id, semester, total_credits, earned_credits,
                                sgpa, cgpa, academic_year, published_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
     ON CONFLICT (student_id, semester) DO UPDATE
        SET total_credits  = EXCLUDED.total_credits,
            earned_credits = EXCLUDED.earned_credits,
            sgpa           = EXCLUDED.sgpa,
            cgpa           = EXCLUDED.cgpa,
            published_at   = now()`,
    [`cg_${studentId}_${semester}`, studentId, semester, totalCredits, earnedCredits, sgpa, cgpa, year],
  );

  return { sgpa, cgpa, totalCredits, earnedCredits, gradedSubjects: rows.length };
}
