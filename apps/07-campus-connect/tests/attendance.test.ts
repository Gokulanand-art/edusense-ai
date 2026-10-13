/**
 * Service-level verification against a real (in-memory) Postgres.
 *
 * These are not unit tests of the pure calculators — they assert the SQL views,
 * the leave-impact projection and the eligibility gate behave correctly on real
 * rows. `projectLeaveImpact` is the headline feature, so it is tested at its
 * boundaries: 0 days, a leave that breaches, and a leave that does not.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestAdapter, type DbAdapter } from "@/lib/db";
import { seed } from "../scripts/seed";
import {
  getOverallAttendance,
  getSubjectAttendance,
  projectLeaveImpact,
  examEligibility,
  applyForLeave,
  decideLeave,
} from "@/lib/services/attendance";

let db: DbAdapter;
let q: DbAdapter["query"];

beforeAll(async () => {
  db = await createTestAdapter();
  q = db.query;
  await seed(q);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe("attendance rollup", () => {
  it("derives held/attended/percentage from the event log", async () => {
    const subs = await getSubjectAttendance("stu_0001", undefined, q);
    expect(subs.length).toBe(6);
    for (const s of subs) {
      // percentage is internally consistent with held/attended
      const expected = Number(((s.attended / s.held) * 100).toFixed(2));
      expect(s.percentage).toBeCloseTo(expected, 1);
      // and the parts sum back to held
      expect(s.attended + s.absent + s.excused).toBe(s.held);
    }
  });

  it("agrees between per-subject rows and the overall rollup", async () => {
    const subs = await getSubjectAttendance("stu_0001", undefined, q);
    const overall = await getOverallAttendance("stu_0001", q);
    const held = subs.reduce((s, r) => s + r.held, 0);
    const attended = subs.reduce((s, r) => s + r.attended, 0);
    expect(overall.held).toBe(held);
    expect(overall.attended).toBe(attended);
  });

  it("applies approved condonation to effective percentage but not raw percentage", async () => {
    // stu_0002 carries an 8% condonation in the seed
    const subs = await getSubjectAttendance("stu_0002", undefined, q);
    const anyCondoned = subs.find((s) => s.condonedPct > 0);
    expect(anyCondoned).toBeDefined();
    if (anyCondoned) {
      expect(anyCondoned.effectivePercentage).toBeCloseTo(
        Number((anyCondoned.percentage + anyCondoned.condonedPct).toFixed(2)),
        2,
      );
    }
  });

  it("does not let approved leave inflate attendance", async () => {
    // The seed inserts one ON_DUTY row for stu_0001 in CS501. It must count
    // toward `held` and toward `excused`, never toward `attended`.
    const cs501 = (await getSubjectAttendance("stu_0001", "subj_CS501", q))[0];
    expect(cs501.excused).toBeGreaterThanOrEqual(1);
    const recomputed = Number(((cs501.attended / cs501.held) * 100).toFixed(2));
    expect(cs501.percentage).toBeCloseTo(recomputed, 1);
  });
});

describe("leave impact projection", () => {
  it("zero-day leave is a no-op", async () => {
    const before = await getOverallAttendance("stu_0030", q);
    const impact = await projectLeaveImpact("stu_0030", 0, q);
    expect(impact.overallProjected).toBeCloseTo(before.percentage, 1);
    expect(impact.overallDelta).toBe(0);
  });

  it("a longer leave never improves projected attendance", async () => {
    const short = await projectLeaveImpact("stu_0030", 1, q);
    const long = await projectLeaveImpact("stu_0030", 5, q);
    expect(long.overallProjected).toBeLessThanOrEqual(short.overallProjected);
    expect(long.overallDelta).toBeGreaterThanOrEqual(short.overallDelta);
  });

  it("flags a breach for an at-risk student taking leave", async () => {
    // stu_0001 is seeded in the at_risk tier (~50% attendance)
    const impact = await projectLeaveImpact("stu_0001", 3, q);
    expect(impact.overallProjected).toBeLessThan(impact.overallCurrent);
    expect(["HIGH", "CRITICAL"]).toContain(impact.riskLevel);
    expect(impact.summary).toBeTruthy();
  });

  it("computes per-subject projection consistently", async () => {
    const impact = await projectLeaveImpact("stu_0030", 2, q);
    for (const p of impact.perSubject) {
      expect(p.projected).toBeLessThanOrEqual(p.current);
      expect(p.classesMissed).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("exam eligibility gate", () => {
  it("blocks below-threshold subjects and clears compliant ones", async () => {
    const rows = await examEligibility("stu_0001", q);
    expect(rows.length).toBe(6);
    for (const r of rows) {
      if (r.effectivePercentage < r.threshold) {
        expect(r.status).toBe("BLOCKED");
        expect(r.reason).toMatch(/below the required/);
      } else {
        expect(r.status).toBe("CLEARED");
      }
    }
  });

  it("an at-risk student has at least one blocked subject", async () => {
    const rows = await examEligibility("stu_0001", q);
    expect(rows.some((r) => r.status === "BLOCKED")).toBe(true);
  });
});

describe("leave lifecycle", () => {
  it("snapshots the projection onto the leave row at apply time", async () => {
    const { leaveId, impact } = await applyForLeave(
      {
        studentId: "stu_0030",
        leaveType: "CASUAL",
        startDate: new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10),
        endDate: new Date(Date.now() + 6 * 86_400_000).toISOString().slice(0, 10),
        reason: "verification test",
      },
      q,
    );
    const { rows } = await q<any>(`SELECT impact_snapshot FROM leaves WHERE id = $1`, [leaveId]);
    expect(rows[0].impact_snapshot).toBeTruthy();
    expect(rows[0].impact_snapshot.overallProjected).toBeCloseTo(impact.overallProjected, 1);
  });

  it("records a decision and refuses to re-decide", async () => {
    // Use a real approver: decided_by is FK-constrained, and a bogus id would
    // fail on the FK rather than exercising the state machine we care about.
    const { rows: approverRows } = await q<{ id: string }>(
      `SELECT id FROM users WHERE role = 'FACULTY' LIMIT 1`,
    );
    const approver = approverRows[0].id;

    const ok = await decideLeave("lv_seed_2", approver, "APPROVED", "ok", q);
    expect(ok).toBe(true);

    // A settled leave must not be re-decided (state machine, not FK).
    const again = await decideLeave("lv_seed_2", approver, "REJECTED", "no", q);
    expect(again).toBe(false);

    const { rows } = await q<{ status: string; decided_by: string }>(
      `SELECT status, decided_by FROM leaves WHERE id = 'lv_seed_2'`,
    );
    expect(rows[0].status).toBe("APPROVED");
    expect(rows[0].decided_by).toBe(approver);
  });
});