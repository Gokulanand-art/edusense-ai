/**
 * Academic-record generation, shared by the demo seed and the real CSBS import.
 *
 * Extracted so imported students get records built by exactly the same rules as
 * the seeded ones — otherwise the Excel cohort would silently behave differently
 * from the rest of the roster, and every dashboard would be comparing two
 * different generators.
 */
import type { QueryFn } from "@/lib/db";

export interface Rng {
  rnd: () => number;
  ri: (min: number, max: number) => number;
  rf: (min: number, max: number) => number;
  pick: <T>(arr: readonly T[]) => T;
}

/** Deterministic PRNG — reproducible seed output. */
export function makeRng(seed = 42): Rng {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
  const rf = (min: number, max: number) => Number((rnd() * (max - min) + min).toFixed(2));
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
  return { rnd, ri, rf, pick };
}

/**
 * Format from LOCAL calendar parts, not toISOString().
 *
 * toISOString() converts to UTC, so for a campus in IST (UTC+5:30) any date
 * generated before ~05:30 local becomes the *previous* day — which silently
 * leaves "today" empty and shifts the whole attendance window. This college
 * is in Tamil Nadu, so local parts are the correct basis.
 */
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

/**
 * Skill tiers drive both attendance rate and mark base, so a student who is
 * weak in class is also weak on paper. Splitting those would produce data that
 * looks coherent on each dashboard but contradicts across them.
 */
export type Tier = "at_risk" | "borderline" | "healthy" | "strong";

export const TIER_ORDER: Tier[] = ["at_risk", "borderline", "healthy", "strong"];

const ATTEND: Record<Tier, number> = {
  at_risk: 0.5,
  borderline: 0.68,
  healthy: 0.88,
  strong: 0.93,
};
export const MARK_BASE: Record<Tier, number> = {
  at_risk: 42,
  borderline: 56,
  healthy: 68,
  strong: 80,
};

/**
 * Spread a cohort across the tiers rather than assigning by index: an imported
 * roster should look like a class, not like the first N were failures.
 */
export function assignTiers(count: number): Tier[] {
  const out: Tier[] = [];
  // roughly 12% at risk, 20% borderline, 40% healthy, 28% strong
  const weights: Array<[Tier, number]> = [
    ["at_risk", 0.12],
    ["borderline", 0.2],
    ["healthy", 0.4],
    ["strong", 0.28],
  ];
  for (let i = 0; i < count; i++) {
    const r = (i / count + 0.137) % 1; // offset so the run doesn't start at risk
    let acc = 0;
    for (const [tier, w] of weights) {
      acc += w;
      if (r < acc) {
        out.push(tier);
        break;
      }
    }
  }
  return out;
}

/**
 * Attendance + marks + CGPA for one student across their department's subjects.
 *
 * `idPrefix` keeps generated row ids unique when the same student id is used by
 * both the seed and the import.
 */
export async function generateAcademicRecords(
  run: QueryFn,
  opts: {
    studentId: string;
    subjectCodes: readonly string[];
    facultyIds: readonly string[];
    tier: Tier;
    rng: Rng;
    idPrefix?: string;
    /**
     * How many days back the most recent session sits. The seed leaves a
     * recent window free so its leave/ON_DUTY edge cases have clean dates;
     * the CSBS import wants sessions running up to today so the portal's
     * "today" panels are populated.
     */
    newestSessionDaysAgo?: number;
  },
): Promise<void> {
  const { studentId, subjectCodes, facultyIds, tier, rng } = opts;
  const pfx = opts.idPrefix ?? studentId;
  const { rnd, rf, pick } = rng;
  const attendRate = ATTEND[tier];
  // Shifting the whole window by a constant keeps the seed's dates bit-identical
  // (shift=0 reproduces the original formula exactly) while letting the import
  // run its sessions up to today.
  const newest = opts.newestSessionDaysAgo ?? 11;
  const shift = 11 - newest;

  for (const code of subjectCodes) {
    const sessions = 40;
    for (let s = 0; s < sessions; s++) {
      const status = rnd() < attendRate ? "PRESENT" : rnd() < 0.85 ? "ABSENT" : "LATE";
      await run(
        `INSERT INTO attendance (id,student_id,subject_id,class_date,period_no,status,marked_by,source)
         VALUES ($1,$2,$3,$4,1,$5,$6,'QR')
         ON CONFLICT DO NOTHING`,
        [
          `att_${pfx}_${code}_${s}`,
          studentId,
          `subj_${code}`,
          daysAgo(Math.max(0, 8 + (sessions - s) * 2 + (s % 2) - shift)),
          status,
          pick(facultyIds),
        ],
      );
    }
  }

  for (const code of subjectCodes) {
    // MARK_BASE is a target PERCENTAGE. Scale it to the actual maxima (40/60).
    // The previous form multiplied the percentage by 0.9/1.05 and then capped,
    // which pinned borderline/healthy/strong at 99-100% and made three of the
    // four tiers indistinguishable.
    const base = MARK_BASE[tier];
    const drift = rf(-4, 4);
    const internal = Math.max(0, Math.min(40, Math.round((base + drift) * 0.4)));
    const external = Math.max(0, Math.min(60, Math.round((base + drift + 2) * 0.6)));
    await run(
      `INSERT INTO marks (id,student_id,subject_id,exam_type,semester,internal_marks,external_marks,internal_max,external_max,graded_by,published_at)
       VALUES ($1,$2,$3,'SEMESTER',5,$4,$5,40,60,$6, now() - INTERVAL '10 days')
       ON CONFLICT DO NOTHING`,
      [
        `mk_${pfx}_${code}`,
        studentId,
        `subj_${code}`,
        Math.max(0, internal),
        Math.max(0, external),
        pick(facultyIds),
      ],
    );
  }

  await generateCgpa(run, studentId);
}

/** CGPA derived from the marks just written, so the two can never disagree. */
export async function generateCgpa(run: QueryFn, studentId: string): Promise<void> {
  const { rows } = await run<any>(
    `SELECT s.credits, (m.internal_marks + m.external_marks) AS got, 100.0 AS mx
       FROM marks m JOIN subjects s ON s.id = m.subject_id
      WHERE m.student_id = $1`,
    [studentId],
  );
  const gp = (pct: number) =>
    pct >= 90 ? 10 : pct >= 80 ? 9 : pct >= 70 ? 8 : pct >= 60 ? 7 : pct >= 50 ? 6 : pct >= 40 ? 5 : 0;

  let points = 0;
  let credits = 0;
  for (const r of rows) {
    const pct = (Number(r.got) / Number(r.mx)) * 100;
    points += gp(pct) * Number(r.credits);
    credits += Number(r.credits);
  }
  const cgpa = credits > 0 ? Number((points / credits).toFixed(2)) : 0;

  await run(
    `INSERT INTO cgpa_records (id,student_id,semester,total_credits,earned_credits,sgpa,cgpa,academic_year,published_at)
     VALUES ($1,$2,5,$3,$3,$4,$4,$5, now() - INTERVAL '10 days')
     ON CONFLICT (student_id, semester) DO NOTHING`,
    [`cg_${studentId}_5`, studentId, credits, cgpa, "2025-26"],
  );
}
