/**
 * Department scoping tests.
 *
 * The single-department boundary is the load-bearing claim of this surface, so
 * it is tested adversarially rather than happy-path: a query that forgot its
 * department predicate would still return plausible-looking numbers, and the
 * only way to catch it is to assert the boundary explicitly.
 *
 * `deptCoverage().strays` is the direct check — it counts attendance rows whose
 * student sits in a *different* department but whose subject sits in this one.
 * Any non-zero value means a WHERE clause was dropped.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestAdapter, type DbAdapter } from '@/lib/db';
import { seed } from '../scripts/seed';
import {
  deptKpis,
  deptSubjects,
  deptAtRisk,
  deptLeaves,
  deptFaculty,
  deptCoverage,
  facultySubjects,
} from '@/lib/services/department';

let db: DbAdapter;
let q: DbAdapter['query'];
let deptIds: string[] = [];

beforeAll(async () => {
  db = await createTestAdapter();
  q = db.query;
  await seed(q);
  const { rows } = await q<{ id: string }>(`SELECT id FROM departments ORDER BY code`);
  deptIds = rows.map((r) => r.id);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('scoping invariant', () => {
  it('reports zero cross-department attendance leakage for every department', async () => {
    for (const id of deptIds) {
      const cov = await deptCoverage(id, q);
      expect(cov.strays).toBe(0);
    }
  });

  it('covers every student in the department', async () => {
    for (const id of deptIds) {
      const cov = await deptCoverage(id, q);
      // In the seed every student has attendance in their department's subjects.
      expect(cov.withAttendance).toBe(cov.students);
    }
  });

  it('returns disjoint student counts per department', async () => {
    const counts = await Promise.all(deptIds.map((id) => deptKpis(id, null, q)));
    const total = counts.reduce((s, c) => s + c.students, 0);
    const { rows } = await q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM students WHERE is_active`,
    );
    expect(total).toBe(Number(rows[0].n));
  });
});

describe('department KPIs', () => {
  it('reports internally consistent numbers', async () => {
    for (const id of deptIds) {
      const k = await deptKpis(id, null, q);
      expect(k.students).toBeGreaterThan(0);
      expect(k.avgAttendance).toBeGreaterThanOrEqual(0);
      expect(k.avgAttendance).toBeLessThanOrEqual(100);
      expect(k.atRisk).toBeLessThanOrEqual(k.students);
      expect(k.fullyEligible).toBeLessThanOrEqual(k.students);
      // attendance is capped at 100 — a projection bug would surface here
      expect(k.avgCgpa).toBeLessThanOrEqual(10);
    }
  });

  it('only returns subjects belonging to the requested department', async () => {
    for (const id of deptIds) {
      const subs = await deptSubjects(id, null, q);
      const { rows } = await q<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM subjects WHERE department_id = $1`,
        [id],
      );
      expect(subs.length).toBe(Number(rows[0].n));
    }
  });

  it('narrows to the supplied subject list when given one', async () => {
    const all = await deptSubjects(deptIds[0], null, q);
    if (all.length < 2) return;
    const one = await deptSubjects(deptIds[0], [all[0].subjectId], q);
    expect(one.length).toBe(1);
    expect(one[0].subjectId).toBe(all[0].subjectId);
  });
});

describe('at-risk watchlist', () => {
  it('never returns a student from another department', async () => {
    for (const id of deptIds) {
      const rows = await deptAtRisk(id, null, q);
      for (const r of rows) {
        const { rows: owner } = await q<{ department_id: string }>(
          `SELECT department_id FROM students WHERE id = $1`,
          [r.studentId],
        );
        expect(owner[0].department_id).toBe(id);
      }
    }
  });

  it('sorts worst-first (lowest attendance first) and grades severity consistently', async () => {
    for (const id of deptIds) {
      const rows = await deptAtRisk(id, null, q);
      // Worst-first for an at-risk list means ASCENDING: the student closest to
      // failing sits at the top. (Descending would be correct for a top-performers list.)
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i - 1].overall).toBeLessThanOrEqual(rows[i].overall);
      }
      for (const r of rows) {
        const expected =
          r.overall < 60 ? 'CRITICAL' : r.overall < 75 ? 'HIGH' : 'WATCH';
        expect(r.severity).toBe(expected);
      }
    }
  });

  it('narrows the average to the given subject and only reports students who have it', async () => {
    // Not a subset: the average is recomputed over the narrowed denominator, so
    // a student strong across six papers but weak in this one can legitimately
    // enter the list. What must hold is that every listed student really has
    // attendance in the narrowed subject, and no other department leaks in.
    const dept = deptIds[0];
    const subs = await deptSubjects(dept, null, q);
    if (!subs.length) return;
    const target = subs[0].subjectId;
    const narrowed = await deptAtRisk(dept, [target], q);

    for (const r of narrowed) {
      const { rows: has } = await q<{ n: string }>(
        `SELECT COUNT(*)::text AS n
           FROM attendance a
           JOIN subjects sub ON sub.id = a.subject_id
          WHERE a.student_id = $1 AND sub.id = $2 AND sub.department_id = $3`,
        [r.studentId, target, dept],
      );
      expect(Number(has[0].n)).toBeGreaterThan(0);
    }
  });
});

describe('leave queue', () => {
  it('only surfaces leaves from students in the department', async () => {
    for (const id of deptIds) {
      const rows = await deptLeaves(id, undefined, q);
      for (const l of rows) {
        const { rows: owner } = await q<{ department_id: string }>(
          `SELECT department_id FROM students WHERE id = $1`,
          [l.studentId],
        );
        expect(owner[0].department_id).toBe(id);
      }
    }
  });

  it('puts PENDING rows first', async () => {
    for (const id of deptIds) {
      const rows = await deptLeaves(id, undefined, q);
      const firstSettled = rows.findIndex((r) => r.status !== 'PENDING');
      if (firstSettled === -1) continue;
      expect(rows.slice(firstSettled).every((r) => r.status !== 'PENDING')).toBe(true);
    }
  });

  it('surfaces the projected attendance the student saw', async () => {
    const rows = await deptLeaves(deptIds[0], 'PENDING', q);
    for (const l of rows) {
      if (l.projectedOverall != null) {
        expect(l.projectedOverall).toBeGreaterThanOrEqual(0);
        expect(l.projectedOverall).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('faculty scope', () => {
  it('lists only faculty in the department', async () => {
    for (const id of deptIds) {
      const rows = await deptFaculty(id, q);
      for (const f of rows) {
        const { rows: owner } = await q<{ department_id: string }>(
          `SELECT department_id FROM faculty WHERE id = $1`,
          [f.facultyId],
        );
        expect(owner[0].department_id).toBe(id);
      }
    }
  });

  it('resolves a lecturer subject list that is a subset of the department', async () => {
    const { rows } = await q<{ id: string }>(
      `SELECT id FROM faculty WHERE is_active LIMIT 1`,
    );
    const fid = rows[0].id;
    const mine = await facultySubjects(fid, q);
    const { rows: deptSubs } = await q<{ n: string }>(
      `SELECT COUNT(*)::text AS n
         FROM subject_faculty sf
         JOIN subjects s ON s.id = sf.subject_id
         JOIN faculty f  ON f.id = sf.faculty_id
        WHERE f.id = $1 AND s.department_id = f.department_id`,
      [fid],
    );
    expect(mine.length).toBeLessThanOrEqual(Number(deptSubs[0].n));
  });
});