/**
 * Attendance service.
 *
 * This is where Campus Connect diverges from conventional ERPs (MyCamu, Camu,
 * typical college software): the leave-impact projection is a first-class,
 * audited computation, not an afterthought. A student sees the exact attendance
 * they will have *before* applying, and the projection they acted on is
 * snapshotted onto the leave row.
 *
 * Definitions used throughout (deliberately explicit, because different
 * colleges define "attendance" differently and mixing them is the #1 source of
 * disputed numbers):
 *
 *   held      — classes for which the student was enrolled (every logged row)
 *   attended  — PRESENT or LATE
 *   excused   — ON_DUTY or EXCUSED (approved leave): held, but not attended
 *   percentage = attended / held * 100
 *   effective_percentage = percentage + approved condonation
 *
 * An approved leave therefore does NOT inflate attendance — it is recorded and
 * visible. Condonation is the only mechanism that adjusts a percentage, and it
 * is capped at 10% with an approver and a reason.
 */
import { getDb, type QueryFn } from "@/lib/db";
import { calculatePercentage, ATTENDANCE_THRESHOLDS } from "@/lib/utils/attendance";

export interface SubjectAttendanceRow {
  subjectId: string;
  code: string;
  name: string;
  credits: number;
  threshold: number;
  held: number;
  attended: number;
  absent: number;
  excused: number;
  percentage: number;
  condonedPct: number;
  effectivePercentage: number;
  isBelowThreshold: boolean;
}

export interface OverallAttendance {
  held: number;
  attended: number;
  absent: number;
  excused: number;
  percentage: number;
  condonedPct: number;
  effectivePercentage: number;
  threshold: number;
  isEligibleForExam: boolean;
  subjectsAtRisk: SubjectAttendanceRow[];
}

export async function getSubjectAttendance(
  studentId: string,
  subjectId?: string,
  q?: QueryFn,
): Promise<SubjectAttendanceRow[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<any>(
    `SELECT subject_id, subject_code, subject_name, credits,
            exam_eligibility_threshold, held, attended, absent, excused,
            percentage, condoned_pct, effective_percentage, is_below_threshold
       FROM v_attendance_status
      WHERE student_id = $1
        AND ($2::text IS NULL OR subject_id = $2)
      ORDER BY subject_code`,
    [studentId, subjectId ?? null],
  );

  return rows.map((r) => ({
    subjectId: r.subject_id,
    code: r.subject_code,
    name: r.subject_name,
    credits: Number(r.credits),
    threshold: Number(r.exam_eligibility_threshold),
    held: Number(r.held),
    attended: Number(r.attended),
    absent: Number(r.absent),
    excused: Number(r.excused),
    percentage: Number(r.percentage),
    condonedPct: Number(r.condoned_pct),
    effectivePercentage: Number(r.effective_percentage),
    isBelowThreshold: r.is_below_threshold === true,
  }));
}

export async function getOverallAttendance(
  studentId: string,
  q?: QueryFn,
): Promise<OverallAttendance> {
  const run: QueryFn = q ?? (await getDb()).query;
  const subjects = await getSubjectAttendance(studentId, undefined, run);

  const held = subjects.reduce((s, r) => s + r.held, 0);
  const attended = subjects.reduce((s, r) => s + r.attended, 0);
  const absent = subjects.reduce((s, r) => s + r.absent, 0);
  const excused = subjects.reduce((s, r) => s + r.excused, 0);

  const pct = calculatePercentage(attended, held);
  // Condonation is per-subject in the schema; for the overall figure we apply
  // the student's condoned pct from the current semester only, and surface the
  // component figures so the arithmetic is auditable.
  const condoned = subjects.length
    ? Number(
        (
          subjects.reduce((s, r) => s + r.condonedPct * r.held, 0) / (held || 1)
        ).toFixed(2),
      )
    : 0;

  const effective = Number((pct + condoned).toFixed(2));
  const threshold = ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT;

  return {
    held,
    attended,
    absent,
    excused,
    percentage: pct,
    condonedPct: condoned,
    effectivePercentage: effective,
    threshold,
    isEligibleForExam: effective >= threshold && subjects.every((s) => !s.isBelowThreshold),
    subjectsAtRisk: subjects.filter((s) => s.isBelowThreshold),
  };
}

/* ------------------------------------------------------- leave impact (core) */

export interface LeaveImpact {
  leaveDays: number;
  perSubject: Array<{
    subjectId: string;
    code: string;
    name: string;
    current: number;
    projected: number;
    delta: number;
    threshold: number;
    willBreach: boolean;
    classesMissed: number;
  }>;
  overallCurrent: number;
  overallProjected: number;
  overallDelta: number;
  overallWillBreach: boolean;
  worstSubject: { code: string; name: string; projected: number; delta: number } | null;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  summary: string;
}

/**
 * Project attendance impact of a leave, per subject and overall.
 *
 * `heldPerDay` is how many of the student's enrolled subjects meet on a typical
 * day. Rather than guessing a global "classes per day", we use each subject's
 * own observed meeting cadence over the last 60 days — so a student taking 3
 * lab days and 2 theory days gets a per-subject projection, not a flat haircut.
 */
export async function projectLeaveImpact(
  studentId: string,
  leaveDays: number,
  q?: QueryFn,
): Promise<LeaveImpact> {
  const run: QueryFn = q ?? (await getDb()).query;
  const subjects = await getSubjectAttendance(studentId, undefined, run);

  // Observed meetings per weekday for each subject over the trailing 60 days.
  const { rows: cadence } = await run<{ subject_id: string; meetings_per_day: string }>(
    `SELECT subject_id,
            ROUND(COUNT(*)::numeric / GREATEST(COUNT(DISTINCT class_date), 1), 3)::text
              AS meetings_per_day
       FROM attendance
      WHERE student_id = $1
        AND class_date >= CURRENT_DATE - INTERVAL '60 days'
      GROUP BY subject_id`,
    [studentId],
  );
  const perDay = new Map(cadence.map((c) => [c.subject_id, Number(c.meetings_per_day)]));

  const perSubject = subjects.map((s) => {
    // Expected classes missed = leaveDays × this subject's meeting cadence.
    const classesMissed = Number((leaveDays * (perDay.get(s.subjectId) ?? 0)).toFixed(2));
    const newHeld = s.held + classesMissed;
    const projected = calculatePercentage(s.attended, newHeld);
    return {
      subjectId: s.subjectId,
      code: s.code,
      name: s.name,
      current: s.effectivePercentage,
      projected,
      delta: Number((s.effectivePercentage - projected).toFixed(2)),
      threshold: s.threshold,
      willBreach: projected < s.threshold,
      classesMissed,
    };
  });

  const overallHeld = subjects.reduce((s, r) => s + r.held, 0);
  const overallAttended = subjects.reduce((s, r) => s + r.attended, 0);
  const missed = perSubject.reduce((s, r) => s + r.classesMissed, 0);
  const overallCurrent = calculatePercentage(overallAttended, overallHeld);
  const overallProjected = calculatePercentage(overallAttended, overallHeld + missed);
  const overallDelta = Number((overallCurrent - overallProjected).toFixed(2));
  const overallWillBreach = overallProjected < ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT;

  const breaching = perSubject.filter((p) => p.willBreach);
  const worst = [...perSubject].sort((a, b) => a.projected - b.projected)[0] ?? null;

  return {
    leaveDays,
    perSubject,
    overallCurrent,
    overallProjected,
    overallDelta,
    overallWillBreach,
    worstSubject:
      worst && worst.projected < worst.threshold
        ? { code: worst.code, name: worst.name, projected: worst.projected, delta: worst.delta }
        : null,
    riskLevel: riskLevel(overallProjected, breaching.length),
    summary: buildSummary(leaveDays, overallDelta, overallWillBreach, breaching.length, worst),
  };
}

function riskLevel(overallProjected: number, breachCount: number): LeaveImpact["riskLevel"] {
  const buffer = overallProjected - ATTENDANCE_THRESHOLDS.INSTITUTION_DEFAULT;
  if (buffer < 0 || breachCount >= 3) return "CRITICAL";
  if (buffer < 5 || breachCount > 0) return "HIGH";
  if (buffer < 10) return "MEDIUM";
  return "LOW";
}

function buildSummary(
  days: number,
  delta: number,
  overallBreach: boolean,
  breachCount: number,
  worst: LeaveImpact["worstSubject"],
): string {
  const parts: string[] = [];
  if (delta <= 0) {
    parts.push(`A ${days}-day leave has no measurable effect on overall attendance.`);
  } else {
    parts.push(`A ${days}-day leave reduces overall attendance by ${delta.toFixed(2)} percentage points.`);
  }
  if (overallBreach) {
    parts.push("Overall attendance would fall below the 75% eligibility threshold.");
  }
  if (breachCount > 0) {
    parts.push(
      `${breachCount} subject${breachCount > 1 ? "s" : ""} would breach the per-subject threshold` +
        (worst ? `, worst being ${worst.code} at ${worst.projected.toFixed(2)}%.` : "."),
    );
  }
  if (!overallBreach && breachCount === 0) {
    parts.push("All subjects remain above their eligibility thresholds.");
  }
  return parts.join(" ");
}

/* ------------------------------------------------------------ leave lifecycle */

export async function applyForLeave(
  input: {
    studentId: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    reason: string;
    hasMedicalCert?: boolean;
  },
  q?: QueryFn,
): Promise<{ leaveId: string; impact: LeaveImpact }> {
  const run: QueryFn = q ?? (await getDb()).query;

  const start = new Date(input.startDate);
  const end = new Date(input.endDate);
  const leaveDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

  // Project BEFORE persisting: the student is shown this, then the snapshot is
  // stored so the decision they made remains auditable.
  const impact = await projectLeaveImpact(input.studentId, leaveDays, run);

  const leaveId = `lv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  await run(
    `INSERT INTO leaves (id, student_id, leave_type, start_date, end_date, no_of_days,
                         reason, has_medical_cert, impact_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      leaveId,
      input.studentId,
      input.leaveType,
      input.startDate,
      input.endDate,
      leaveDays,
      input.reason,
      input.hasMedicalCert ?? false,
      JSON.stringify(impact),
    ],
  );
  await run(
    `INSERT INTO leave_events (id, leave_id, to_status, note) VALUES ($1,$2,'PENDING',$3)`,
    [`lve_${Date.now().toString(36)}`, leaveId, "submitted by student"],
  );

  return { leaveId, impact };
}

export async function decideLeave(
  leaveId: string,
  approverUserId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string,
  q?: QueryFn,
): Promise<boolean> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rowCount } = await run(
    `UPDATE leaves
        SET status = $1, decided_by = $2, decided_at = now(), decision_note = $3
      WHERE id = $4 AND status = 'PENDING'`,
    [decision, approverUserId, note ?? null, leaveId],
  );
  if ((rowCount ?? 0) === 0) return false;

  await run(
    `INSERT INTO leave_events (id, leave_id, actor_id, from_status, to_status, note)
     VALUES ($1,$2,$3,'PENDING',$4,$5)`,
    [`lve_${Date.now().toString(36)}`, leaveId, approverUserId, decision, note ?? null],
  );
  return true;
}

export async function listLeaves(
  filters: { studentId?: string; status?: string; limit?: number },
  q?: QueryFn,
) {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run(
    `SELECT l.*, u.first_name || ' ' || u.last_name AS student_name
       FROM leaves l
       JOIN students s ON s.id = l.student_id
       JOIN users u ON u.id = s.user_id
      WHERE ($1::text IS NULL OR l.student_id = $1)
        AND ($2::text IS NULL OR l.status = $2)
      ORDER BY l.applied_at DESC
      LIMIT $3`,
    [filters.studentId ?? null, filters.status ?? null, filters.limit ?? 50],
  );
  return rows;
}

/* --------------------------------------------------------------- eligibility */

export interface EligibilityRow {
  subjectId: string;
  code: string;
  name: string;
  effectivePercentage: number;
  threshold: number;
  status: "CLEARED" | "BLOCKED";
  reason: string;
}

/** The exam-registration gate: what a student can and cannot register for. */
export async function examEligibility(studentId: string, q?: QueryFn): Promise<EligibilityRow[]> {
  const subjects = await getSubjectAttendance(studentId, undefined, q);
  return subjects.map((s) => ({
    subjectId: s.subjectId,
    code: s.code,
    name: s.name,
    effectivePercentage: s.effectivePercentage,
    threshold: s.threshold,
    status: s.isBelowThreshold ? ("BLOCKED" as const) : ("CLEARED" as const),
    reason: s.isBelowThreshold
      ? `${s.effectivePercentage.toFixed(2)}% is below the required ${s.threshold}%. Shortfall ${(
          s.threshold - s.effectivePercentage
        ).toFixed(2)}%. Apply for medical condonation or attend ${Math.ceil(
          (s.threshold * s.held - 100 * s.attended) / (100 - s.threshold),
        )} consecutive classes to clear.`
      : `${s.effectivePercentage.toFixed(2)}% meets the ${s.threshold}% requirement.`,
  }));
}

/** Classes to attend consecutively to reach the threshold, or null if already clear. */
export async function classesToClear(
  studentId: string,
  subjectId: string,
  q?: QueryFn,
): Promise<number | null> {
  const rows = await getSubjectAttendance(studentId, subjectId, q);
  const s = rows[0];
  if (!s || !s.isBelowThreshold) return null;
  return Math.ceil((s.threshold * s.held - 100 * s.attended) / (100 - s.threshold));
}