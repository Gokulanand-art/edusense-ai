/**
 * Per-session attendance impact.
 *
 * The question this answers is "on that day they were absent — how much did it
 * cost, and what would it have gained?" The existing rollups answer "what is
 * your percentage"; they cannot explain the movement.
 *
 * Method: walk the register in date order and compute the running percentage
 * before and after each session.
 *
 *   before = attendedSoFar / heldSoFar * 100
 *   after  = attendedSoFar(+present?) / (heldSoFar + 1) * 100
 *
 * `gain` is the percentage points the session added; `cost` is what it removed.
 * Both are reported against the running average *before* that session, so the
 * sum of the parts equals the overall movement — the figures reconcile instead
 * of being individually plausible.
 */
import type { QueryFn } from "@/lib/db";

export type AttendanceStatus =
  | "PRESENT"
  | "ABSENT"
  | "LATE"
  | "HALF_DAY"
  | "ON_DUTY"
  | "EXCUSED";

/** Statuses that count towards attendance. */
const ATTENDED = new Set<AttendanceStatus>(["PRESENT", "LATE"]);

/**
 * Statuses excused by policy. They occupy a held slot but do not count as
 * absence — otherwise an approved medical leave would show up as a penalty,
 * which is exactly what condonation exists to prevent.
 */
const EXCUSED = new Set<AttendanceStatus>(["ON_DUTY", "EXCUSED"]);

const pct = (attended: number, held: number) =>
  held > 0 ? Number(((attended / held) * 100).toFixed(2)) : 0;

export interface SessionImpact {
  id: string;
  date: string;
  subjectCode: string;
  subjectName: string;
  status: AttendanceStatus;
  /** running totals *before* this session */
  heldBefore: number;
  attendedBefore: number;
  pctBefore: number;
  /** running totals *after* this session */
  heldAfter: number;
  attendedAfter: number;
  pctAfter: number;
  /** percentage points this session added (present/late) or removed */
  delta: number;
  /** true when the status did not affect the percentage at all */
  neutral: boolean;
}

export interface DayImpact {
  date: string;
  sessions: SessionImpact[];
  present: number;
  absent: number;
  excused: number;
  held: number;
  pctBefore: number;
  pctAfter: number;
  /** net percentage-point movement across the day */
  delta: number;
}

export interface StudentImpact {
  studentId: string;
  held: number;
  attended: number;
  absent: number;
  excused: number;
  percentage: number;
  threshold: number;
  isBelowThreshold: boolean;
  /** points still recoverable by attending the rest of a projected week */
  sessionsToThreshold: number | null;
  /** what one more / one more absence would do, right now */
  nextPresent: { pct: number; delta: number };
  nextAbsent: { pct: number; delta: number };
  days: DayImpact[];
  /** newest-first, capped at `limitDays` for display — NOT the whole register */
  daysTruncated: boolean;
  /** newest-first, capped at 40 — NOT the whole register */
  recent: SessionImpact[];
  recentTruncated: boolean;
  subjects: Array<{
    subjectId: string;
    code: string;
    name: string;
    held: number;
    attended: number;
    percentage: number;
    belowThreshold: boolean;
  }>;
}

export async function attendanceImpact(
  studentId: string,
  opts: { limitDays?: number; q?: QueryFn } = {},
): Promise<StudentImpact> {
  const run: QueryFn = opts.q ?? (await getDbFallback()).query;
  const { rows } = await run<any>(
    `SELECT a.id, a.class_date::text AS class_date, a.status,
            s.code AS subject_code, s.name AS subject_name, s.id AS subject_id,
            s.exam_eligibility_threshold AS threshold
       FROM attendance a
       JOIN subjects s ON s.id = a.subject_id
      WHERE a.student_id = $1
      ORDER BY a.class_date ASC, s.code ASC, a.period_no ASC`,
    [studentId],
  );

  let held = 0;
  let attended = 0;
  let absent = 0;
  let excused = 0;
  const days = new Map<string, SessionImpact[]>();
  const bySubject = new Map<string, { held: number; attended: number; code: string; name: string; threshold: number }>();

  for (const r of rows) {
    const status = String(r.status) as AttendanceStatus;
    const date = String(r.class_date).slice(0, 10);

    const heldBefore = held;
    const attendedBefore = attended;
    const pctBefore = pct(attended, held);

    held += 1;
    const counts = ATTENDED.has(status);
    if (counts) attended += 1;
    else if (EXCUSED.has(status)) excused += 1;
    else absent += 1;

    const pctAfter = pct(attended, held);
    const neutral = EXCUSED.has(status);

    const sub = bySubject.get(r.subject_id) ?? {
      held: 0,
      attended: 0,
      code: r.subject_code,
      name: r.subject_name,
      threshold: Number(r.threshold),
    };
    sub.held += 1;
    if (counts) sub.attended += 1;
    bySubject.set(r.subject_id, sub);

    const impact: SessionImpact = {
      id: r.id,
      date,
      subjectCode: r.subject_code,
      subjectName: r.subject_name,
      status,
      heldBefore,
      attendedBefore,
      pctBefore,
      heldAfter: held,
      attendedAfter: attended,
      pctAfter,
      delta: Number((pctAfter - pctBefore).toFixed(2)),
      neutral,
    };

    if (!days.has(date)) days.set(date, []);
    days.get(date)!.push(impact);
  }

  const limitDays = opts.limitDays ?? 60;
  const threshold = rows.length ? Number(rows[0].threshold) : 75;
  const percentage = pct(attended, held);

  const dayList: DayImpact[] = [...days.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([date, sessions]) => {
      const heldBefore = sessions[0].heldBefore;
      const attendedBefore = sessions[0].attendedBefore;
      const last = sessions[sessions.length - 1];
      return {
        date,
        sessions,
        present: sessions.filter((s) => ATTENDED.has(s.status)).length,
        absent: sessions.filter((s) => !ATTENDED.has(s.status) && !EXCUSED.has(s.status)).length,
        excused: sessions.filter((s) => EXCUSED.has(s.status)).length,
        held: sessions.length,
        pctBefore: pct(attendedBefore, heldBefore),
        pctAfter: pct(last.attendedAfter, last.heldAfter),
        delta: Number((pct(last.attendedAfter, last.heldAfter) - pct(attendedBefore, heldBefore)).toFixed(2)),
      };
    });

  // Consecutive future attendances needed to climb back to the threshold,
  // holding the ratio of remaining classes constant.
  let sessionsToThreshold: number | null = null;
  if (percentage < threshold && held > 0) {
    // solve (attended + n) / (held + n) >= t  ->  n >= (t*held - attended) / (1 - t)
    const t = threshold / 100;
    const n = Math.ceil((t * held - attended) / (1 - t));
    sessionsToThreshold = Number.isFinite(n) && n > 0 ? n : null;
  }

  const nextPresentPct = pct(attended + 1, held + 1);
  const nextAbsentPct = pct(attended, held + 1);

  return {
    studentId,
    held,
    attended,
    absent,
    excused,
    percentage,
    threshold,
    isBelowThreshold: percentage < threshold,
    sessionsToThreshold,
    nextPresent: { pct: nextPresentPct, delta: Number((nextPresentPct - percentage).toFixed(2)) },
    nextAbsent: { pct: nextAbsentPct, delta: Number((nextAbsentPct - percentage).toFixed(2)) },
    days: dayList.slice(0, limitDays),
    daysTruncated: dayList.length > limitDays,
    recent: dayList.flatMap((d) => d.sessions).slice(-40).reverse(),
    recentTruncated: dayList.flatMap((d) => d.sessions).length > 40,
    subjects: [...bySubject.entries()]
      .map(([subjectId, s]) => ({
        subjectId,
        code: s.code,
        name: s.name,
        held: s.held,
        attended: s.attended,
        percentage: pct(s.attended, s.held),
        belowThreshold: pct(s.attended, s.held) < s.threshold,
      }))
      .sort((a, b) => a.percentage - b.percentage),
  };
}

/** Lazily imported so the module stays usable from scripts/tests with no adapter. */
async function getDbFallback(): Promise<{ query: QueryFn }> {
  const { getDb } = await import("@/lib/db");
  return getDb();
}
