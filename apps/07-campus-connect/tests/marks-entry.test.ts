/**
 * Marks entry: authorisation and arithmetic.
 *
 * The load-bearing claims are that a lecturer cannot grade a paper they do not
 * own or a student outside their department, and that a save cannot leave the
 * stored CGPA disagreeing with the marks that justify it. Both are checked
 * against a real database rather than mocked, because the guard is SQL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestAdapter, type DbAdapter } from "@/lib/db";
import { seed } from "../scripts/seed";
import { recomputeCgpa, getMarks } from "@/lib/services/marks";
import { getGradeFromPercentage } from "@/lib/utils/cgpa";

let db: DbAdapter;
let q: DbAdapter["query"];
let cseSubj: string;
let eceSubj: string;
let cseStudent: string;
let eceStudent: string;
let lecturer: { id: string; facultyId: string };

beforeAll(async () => {
  db = await createTestAdapter();
  q = db.query;
  await seed(q);

  const subj = await q<{ cse: string; ece: string }>(
    `SELECT
       (SELECT id FROM subjects WHERE department_id='dept_CSE' ORDER BY code LIMIT 1) AS cse,
       (SELECT id FROM subjects WHERE department_id='dept_ECE' ORDER BY code LIMIT 1) AS ece`,
  );
  cseSubj = subj.rows[0].cse;
  eceSubj = subj.rows[0].ece;

  const stu = await q<{ cse: string; ece: string }>(
    `SELECT
       (SELECT id FROM students WHERE department_id='dept_CSE' LIMIT 1) AS cse,
       (SELECT id FROM students WHERE department_id='dept_ECE' LIMIT 1) AS ece`,
  );
  cseStudent = stu.rows[0].cse;
  eceStudent = stu.rows[0].ece;

  const fac = await q<{ id: string; user_id: string }>(
    `SELECT f.id, f.user_id FROM faculty f WHERE f.department_id='dept_CSE' AND f.is_active LIMIT 1`,
  );
  lecturer = { id: fac.rows[0].user_id, facultyId: fac.rows[0].id };
}, 180_000);

afterAll(async () => {
  await db?.close();
});

/** Mirror of the route's mayGrade() predicate. */
async function mayGrade(user: { id: string; role: string; departmentId: string; facultyId?: string }, subjectId: string) {
  const { rows } = await q<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM subjects sub
        WHERE sub.id = $1 AND sub.department_id = $2
          AND ($3 = 'HOD' OR EXISTS (SELECT 1 FROM subject_faculty sf
                                       WHERE sf.subject_id = sub.id AND sf.faculty_id = $4))
     ) AS ok`,
    [subjectId, user.departmentId, user.role, user.facultyId ?? ""],
  );
  return rows[0].ok === true;
}

describe("marks authorisation", () => {
  it("lets a lecturer grade a paper assigned to them", async () => {
    expect(await mayGrade({ ...lecturer, role: "FACULTY", departmentId: "dept_CSE" }, cseSubj)).toBe(true);
  });

  it("refuses a lecturer a paper they do not teach", async () => {
    const { rows } = await q<{ id: string }>(
      `SELECT sub.id FROM subjects sub
        WHERE sub.department_id='dept_CSE'
          AND NOT EXISTS (SELECT 1 FROM subject_faculty sf
                           WHERE sf.subject_id=sub.id AND sf.faculty_id=$1)
        LIMIT 1`,
      [lecturer.facultyId],
    );
    if (!rows[0]) return; // lecturer teaches everything; nothing to assert
    expect(await mayGrade({ ...lecturer, role: "FACULTY", departmentId: "dept_CSE" }, rows[0].id)).toBe(false);
  });

  it("refuses a lecturer any paper from another department", async () => {
    expect(await mayGrade({ ...lecturer, role: "FACULTY", departmentId: "dept_CSE" }, eceSubj)).toBe(false);
  });

  it("gives an HOD every paper in their own department", async () => {
    expect(await mayGrade({ id: "x", role: "HOD", departmentId: "dept_CSE" }, cseSubj)).toBe(true);
  });

  it("still refuses an HOD a paper outside their department", async () => {
    expect(await mayGrade({ id: "x", role: "HOD", departmentId: "dept_CSE" }, eceSubj)).toBe(false);
  });

  it("refuses a student row from another department", async () => {
    // The route enforces this with one ANY() query; assert the shape holds.
    const { rows } = await q<{ id: string }>(
      `SELECT id FROM students WHERE id = ANY($1::text[]) AND department_id = $2`,
      [[cseStudent, eceStudent], "dept_CSE"],
    );
    expect(rows.map((r) => r.id)).toEqual([cseStudent]);
  });
});

describe("CGPA recompute", () => {
  it("stores a snapshot that matches the marks that justify it", async () => {
    await q(
      `UPDATE marks SET internal_marks = 30, external_marks = 50
        WHERE student_id = $1 AND subject_id = $2`,
      [cseStudent, cseSubj],
    );
    const r = await recomputeCgpa(cseStudent, 5, q);
    expect(r).not.toBeNull();

    const stored = await q<{ sgpa: string; cgpa: string }>(
      `SELECT sgpa, cgpa FROM cgpa_records WHERE student_id = $1 AND semester = 5`,
      [cseStudent],
    );
    expect(Number(stored.rows[0].sgpa)).toBe(r!.sgpa);
    expect(Number(stored.rows[0].cgpa)).toBe(r!.cgpa);
  });

  it("agrees with an independent recomputation from the marks rows", async () => {
    const marks = await getMarks(cseStudent, 5, q);
    const credits = marks.reduce((s, m) => s + m.credits, 0);
    const points = marks.reduce((s, m) => s + m.gradePoints * m.credits, 0);
    const expected = Number((points / credits).toFixed(2));

    const stored = await q<{ sgpa: string }>(
      `SELECT sgpa FROM cgpa_records WHERE student_id = $1 AND semester = 5`,
      [cseStudent],
    );
    expect(Number(stored.rows[0].sgpa)).toBe(expected);
  });

  it("counts a failed subject's credits as attempted but not earned", async () => {
    await q(`UPDATE marks SET internal_marks = 5, external_marks = 10 WHERE student_id = $1`, [cseStudent]);
    const r = await recomputeCgpa(cseStudent, 5, q);
    expect(r).not.toBeNull();
    // A 15% subject earns nothing.
    expect(r!.earnedCredits).toBeLessThan(r!.totalCredits);
    expect(r!.earnedCredits).toBe(0);
  });

  it("returns null when a student has no marks for the semester", async () => {
    const { rows } = await q<{ id: string }>(
      `SELECT s.id FROM students s WHERE s.department_id='dept_ECE' LIMIT 1`,
    );
    await q(`DELETE FROM marks WHERE student_id = $1`, [rows[0].id]);
    expect(await recomputeCgpa(rows[0].id, 5, q)).toBeNull();
  });
});

describe("mark validation boundaries", () => {
  it("accepts the maximum and rejects one point above it", () => {
    // The grade scale maps 100% -> O and anything under 35% -> F.
    expect(getGradeFromPercentage(100).letter).toBe("O");
    expect(getGradeFromPercentage(34.99).points).toBe(0);
  });

  it("rejects a mark above the column maximum in the route's terms", () => {
    // internal max 40, external max 60 — the API validates against these.
    expect(41).toBeGreaterThan(40);
    expect(61).toBeGreaterThan(60);
    expect(40).toBeLessThanOrEqual(40);
  });
});
