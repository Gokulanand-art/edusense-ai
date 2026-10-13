/**
 * Account -> department resolution.
 *
 * The seed used to point `departments.hod_user_id` at a lecturer while the real
 * HOD account had no department, so HOD login silently bounced to /login. These
 * tests pin that mapping: every staff role must resolve to exactly one
 * department, and a lecturer's paper list must be a strict subset of the
 * department's (otherwise the HOD/staff distinction is decorative).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestAdapter, type DbAdapter } from '@/lib/db';
import { seed } from '../scripts/seed';
import { authenticate } from '@/lib/auth';
import { deptSubjects, facultySubjects } from '@/lib/services/department';

let db: DbAdapter;
let q: DbAdapter['query'];

beforeAll(async () => {
  db = await createTestAdapter();
  q = db.query;
  await seed(q);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('staff accounts resolve to a department', () => {
  it('maps every HOD login to its own department', async () => {
    for (const dept of ['CSE', 'ECE', 'ME', 'CE', 'EE']) {
      const u = await authenticate(`hod.${dept.toLowerCase()}@campus.edu`, 'campus123', q);
      expect(u, `hod.${dept} should authenticate`).not.toBeNull();
      expect(u!.role).toBe('HOD');
      expect(u!.departmentId).toBe(`dept_${dept}`);
      expect(u!.departmentCode).toBe(dept);
      expect(u!.facultyId).toBeTruthy();
    }
  });

  it('maps every lecturer login to their own department', async () => {
    for (const dept of ['CSE', 'ECE', 'ME', 'CE', 'EE']) {
      const u = await authenticate(`faculty.${dept.toLowerCase()}@campus.edu`, 'campus123', q);
      expect(u).not.toBeNull();
      expect(u!.role).toBe('FACULTY');
      expect(u!.departmentId).toBe(`dept_${dept}`);
    }
  });

  it('rejects a wrong password rather than defaulting open', async () => {
    expect(await authenticate('hod.cse@campus.edu', 'wrong-password', q)).toBeNull();
  });
});

describe('HOD vs lecturer paper list', () => {
  it('gives the HOD papers and the lecturer a strict subset', async () => {
    const hod = await authenticate('hod.cse@campus.edu', 'campus123', q);
    const lecturer = await authenticate('faculty.cse@campus.edu', 'campus123', q);

    const dept = await deptSubjects(hod!.departmentId!, null, q);
    const hodOwn = await facultySubjects(hod!.facultyId!, q);
    const lecOwn = await facultySubjects(lecturer!.facultyId!, q);

    expect(dept.length).toBeGreaterThan(0);
    // Both teach something...
    expect(hodOwn.length).toBeGreaterThan(0);
    expect(lecOwn.length).toBeGreaterThan(0);
    // ...but neither sees the whole department, which is the point of the split.
    expect(hodOwn.length).toBeLessThan(dept.length);
    expect(lecOwn.length).toBeLessThan(dept.length);

    for (const s of [...hodOwn, ...lecOwn]) {
      expect(dept.some((d) => d.subjectId === s.subjectId)).toBe(true);
    }
  });

  it('disjoint: the two lecturers do not own the same paper', async () => {
    const hod = await authenticate('hod.cse@campus.edu', 'campus123', q);
    const lecturer = await authenticate('faculty.cse@campus.edu', 'campus123', q);
    const a = (await facultySubjects(hod!.facultyId!, q)).map((s) => s.subjectId);
    const b = (await facultySubjects(lecturer!.facultyId!, q)).map((s) => s.subjectId);
    const overlap = a.filter((x) => b.includes(x));
    expect(overlap).toEqual([]);
  });
});

describe('student accounts', () => {
  it('resolves a student to their department', async () => {
    const u = await authenticate('student1@campus.edu', 'campus123', q);
    expect(u!.role).toBe('STUDENT');
    expect(u!.departmentId).toBeTruthy();
  });

  it('rolls students into exactly one department each', async () => {
    const { rows } = await q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM students WHERE department_id IS NULL`,
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
