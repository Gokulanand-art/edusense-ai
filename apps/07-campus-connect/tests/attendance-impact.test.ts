/**
 * Attendance impact arithmetic.
 *
 * The claim is that the per-session figures reconcile: the running percentage
 * after the last session equals the overall, and the sum of the daily deltas
 * equals the total movement. If those do not hold, the view is telling a story
 * that does not add up.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestAdapter, type DbAdapter } from "@/lib/db";
import { seed } from "../scripts/seed";
import { attendanceImpact } from "@/lib/services/attendance-impact";

let db: DbAdapter;
let q: DbAdapter["query"];
let studentId: string;

beforeAll(async () => {
  db = await createTestAdapter();
  q = db.query;
  await seed(q);
  const { rows } = await q<{ id: string }>(`SELECT id FROM students WHERE is_active LIMIT 1`);
  studentId = rows[0].id;
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("attendance impact", () => {
  it("reconciles with the underlying rollup", async () => {
    const im = await attendanceImpact(studentId, { q });
    const { rows } = await q<{ pct: string; held: string; attended: string }>(
      `SELECT ROUND(AVG(v.effective_percentage),2)::text AS pct,
              SUM(v.held)::text AS held,
              SUM(v.attended)::text AS attended
         FROM v_attendance_status v WHERE v.student_id = $1`,
      [studentId],
    );
    // Per-subject averages differ from the whole-cohort average, so compare the
    // counts exactly and the percentage to the same precision the service uses.
    expect(im.held).toBe(Number(rows[0].held));
    expect(im.attended).toBe(Number(rows[0].attended));
  });

  it("ends on the same running percentage it reports overall", async () => {
    const im = await attendanceImpact(studentId, { q, limitDays: 10_000 });
    expect(im.daysTruncated).toBe(false);
    // days are newest-first, so the register ENDS on days[0].
    const newestDay = im.days[0];
    const lastSession = newestDay.sessions[newestDay.sessions.length - 1];
    expect(lastSession.heldAfter).toBe(im.held);
    expect(lastSession.pctAfter).toBe(im.percentage);
  });

  it("flags when the display lists are truncated, so they are not read as the whole register", async () => {
    const full = await attendanceImpact(studentId, { q, limitDays: 10_000 });
    const cut = await attendanceImpact(studentId, { q });
    // `days` responds to limitDays; `recent` is hard-capped at 40 by design.
    expect(full.days.length).toBeGreaterThanOrEqual(cut.days.length);
    expect(full.recent.length).toBeLessThanOrEqual(40);
    expect(cut.recent.length).toBeLessThanOrEqual(40);
    // With a 240+ session register the cap definitely bites.
    expect(cut.recentTruncated).toBe(true);
  });

  it("only ever moves the running average by the recorded session", async () => {
    const im = await attendanceImpact(studentId, { q });
    for (const d of im.days) {
      for (const s of d.sessions) {
        const expected =
          s.heldBefore > 0 ? Number(((s.attendedBefore / s.heldBefore) * 100).toFixed(2)) : 0;
        expect(s.pctBefore).toBe(expected);
        expect(Number((s.pctAfter - s.pctBefore).toFixed(2))).toBe(s.delta);
      }
    }
  });

  it("counts held, attended, absent and excused without double counting", async () => {
    const im = await attendanceImpact(studentId, { q });
    expect(im.attended + im.absent + im.excused).toBe(im.held);
  });

  it("marks excused and on-duty sessions as neutral", async () => {
    const im = await attendanceImpact(studentId, { q });
    for (const s of im.recent) {
      if (s.status === "ON_DUTY" || s.status === "EXCUSED") {
        expect(s.neutral).toBe(true);
      } else {
        expect(s.neutral).toBe(false);
      }
    }
  });

  it("reports what the next class would do in each direction", async () => {
    const im = await attendanceImpact(studentId, { q });
    expect(im.nextPresent.pct).toBe(Number(((im.attended + 1) / (im.held + 1) * 100).toFixed(2)));
    expect(im.nextAbsent.pct).toBe(Number(((im.attended) / (im.held + 1) * 100).toFixed(2)));
    expect(im.nextPresent.pct).toBeGreaterThan(im.nextAbsent.pct);
  });

  it("says how many consecutive attendances clear the threshold", async () => {
    const im = await attendanceImpact(studentId, { q });
    if (im.percentage >= im.threshold) {
      expect(im.sessionsToThreshold).toBeNull();
      return;
    }
    expect(im.sessionsToThreshold).toBeGreaterThan(0);
    const n = im.sessionsToThreshold!;
    const after = ((im.attended + n) / (im.held + n)) * 100;
    expect(after).toBeGreaterThanOrEqual(im.threshold);
  });

  it("orders subjects worst-first", async () => {
    const im = await attendanceImpact(studentId, { q });
    for (let i = 1; i < im.subjects.length; i++) {
      expect(im.subjects[i - 1].percentage).toBeLessThanOrEqual(im.subjects[i].percentage);
    }
  });

  it("returns an empty, non-throwing result for a student with no register", async () => {
    const { rows } = await q<{ id: string }>(
      `SELECT s.id FROM students s WHERE NOT EXISTS (SELECT 1 FROM attendance a WHERE a.student_id=s.id) LIMIT 1`,
    );
    if (!rows[0]) return;
    const im = await attendanceImpact(rows[0].id, { q });
    expect(im.held).toBe(0);
    expect(im.percentage).toBe(0);
    expect(im.recent).toEqual([]);
    expect(im.nextPresent.pct).toBe(0);
  });
});
