import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { getDb, type QueryFn } from "@/lib/db";
import { recomputeCgpa } from "@/lib/services/marks";

/**
 * Marks entry for teaching staff.
 *
 * Authorisation, in order:
 *   1. the caller must be FACULTY or HOD;
 *   2. the subject must be one they may grade — a lecturer only the papers in
 *      their own `subject_faculty` rows, an HOD anything in their department;
 *   3. every student in the payload must be enrolled in that department.
 *
 * All three are checked against the database, never against anything the
 * browser sent. A staff member editing another lecturer's paper, or grading a
 * student outside their department, is refused rather than silently ignored.
 */
export const dynamic = "force-dynamic";

async function mayGrade(q: QueryFn, user: SessionUser, subjectId: string): Promise<boolean> {
  const { rows } = await q<{ ok: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM subjects sub
        WHERE sub.id = $1
          AND sub.department_id = $2
          AND (
            $3 = 'HOD'
            OR EXISTS (SELECT 1 FROM subject_faculty sf
                        WHERE sf.subject_id = sub.id AND sf.faculty_id = $4)
          )
     ) AS ok`,
    [subjectId, user.departmentId, user.role, user.facultyId ?? ""],
  );
  return rows[0]?.ok === true;
}

/** Subjects this user is allowed to grade. */
async function gradableSubjects(q: QueryFn, user: SessionUser) {
  const { rows } = await q<any>(
    `SELECT sub.id, sub.code, sub.name, sub.credits, sub.semester,
            (SELECT COUNT(*)::int FROM subject_faculty sf2 WHERE sf2.subject_id = sub.id) AS teachers
       FROM subjects sub
      WHERE sub.department_id = $1
        AND ($2 = 'HOD'
             OR EXISTS (SELECT 1 FROM subject_faculty sf
                         WHERE sf.subject_id = sub.id AND sf.faculty_id = $3))
      ORDER BY sub.code`,
    [user.departmentId, user.role, user.facultyId ?? ""],
  );
  return rows.map((r) => ({
    subjectId: r.id,
    code: r.code,
    name: r.name,
    credits: Number(r.credits),
    semester: Number(r.semester),
    teachers: Number(r.teachers),
  }));
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.departmentId) return NextResponse.json({ error: "No department" }, { status: 403 });
  if (user.role !== "FACULTY" && user.role !== "HOD") {
    return NextResponse.json({ error: "Staff access only" }, { status: 403 });
  }

  const db = await getDb();
  const q = db.query;
  const subjects = await gradableSubjects(q, user);

  const subjectId = new URL(req.url).searchParams.get("subject");
  if (!subjectId) return NextResponse.json({ ok: true, subjects });

  if (!(await mayGrade(q, user, subjectId))) {
    // Do not confirm the subject exists for someone who may not grade it.
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  const semester = Number(new URL(req.url).searchParams.get("semester") ?? 5);
  const { rows } = await q<any>(
    `SELECT s.id AS student_id, s.roll_number, s.user_id,
            u.first_name || ' ' || u.last_name AS name,
            m.id AS mark_id, m.internal_marks, m.external_marks,
            m.internal_max, m.external_max, m.graded_by, m.graded_at
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN marks m
              ON m.student_id = s.id AND m.subject_id = $1 AND m.exam_type = 'SEMESTER' AND m.semester = $2
      WHERE s.department_id = $3 AND s.is_active
      ORDER BY s.roll_number`,
    [subjectId, semester, user.departmentId],
  );

  return NextResponse.json({
    ok: true,
    subjects,
    subject: subjects.find((s) => s.subjectId === subjectId) ?? null,
    semester,
    rows: rows.map((r) => ({
      studentId: r.student_id,
      rollNumber: r.roll_number,
      name: r.name,
      markId: r.mark_id,
      internal: r.internal_marks == null ? null : Number(r.internal_marks),
      external: r.external_marks == null ? null : Number(r.external_marks),
      internalMax: Number(r.internal_max ?? 40),
      externalMax: Number(r.external_max ?? 60),
      gradedBy: r.graded_by,
      gradedAt: r.graded_at,
      lastGradedByMe: r.graded_by === user.id,
    })),
  });
}

interface Entry {
  studentId: string;
  internal: number;
  external: number;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.departmentId) return NextResponse.json({ error: "No department" }, { status: 403 });
  if (user.role !== "FACULTY" && user.role !== "HOD") {
    return NextResponse.json({ error: "Staff access only" }, { status: 403 });
  }

  let body: { subjectId?: string; semester?: number; entries?: Entry[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const subjectId = (body.subjectId ?? "").trim();
  const semester = Number(body.semester ?? 5);
  const entries = body.entries ?? [];

  if (!subjectId) return NextResponse.json({ error: "subjectId required" }, { status: 400 });
  if (!Number.isInteger(semester) || semester < 1) {
    return NextResponse.json({ error: "Invalid semester" }, { status: 400 });
  }
  if (entries.length === 0) return NextResponse.json({ error: "No marks supplied" }, { status: 400 });
  if (entries.length > 500) return NextResponse.json({ error: "Too many rows" }, { status: 400 });

  const db = await getDb();
  const q = db.query;

  if (!(await mayGrade(q, user, subjectId))) {
    return NextResponse.json({ error: "Subject not found" }, { status: 404 });
  }

  // Validate every mark before writing anything, so a bad row cannot leave the
  // class half-saved.
  for (const e of entries) {
    if (!e?.studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });
    for (const [field, max] of [
      ["internal", 40],
      ["external", 60],
    ] as const) {
      const v = Number((e as any)[field]);
      if (!Number.isFinite(v) || v < 0) {
        return NextResponse.json({ error: `${field} must be a number ≥ 0` }, { status: 400 });
      }
      if (v > max) {
        return NextResponse.json({ error: `${field} exceeds the maximum of ${max}` }, { status: 400 });
      }
    }
  }

  // Every student must belong to the subject's department — checked in one
  // query rather than per row.
  const { rows: enrolled } = await q<{ id: string }>(
    `SELECT id FROM students WHERE id = ANY($1::text[]) AND department_id = $2`,
    [entries.map((e) => e.studentId), user.departmentId],
  );
  const enrolledIds = new Set(enrolled.map((r) => r.id));
  const strangers = entries.filter((e) => !enrolledIds.has(e.studentId)).map((e) => e.studentId);
  if (strangers.length) {
    return NextResponse.json(
      { error: "One or more students are not in your department", studentIds: strangers },
      { status: 403 },
    );
  }

  const saved: string[] = [];
  const rejected: Array<{ studentId: string; reason: string }> = [];

  for (const e of entries) {
    const id = `mk_${e.studentId}_${subjectId}_${semester}`;
    const { rowCount } = await q<{ n: number }>(
      `INSERT INTO marks (id, student_id, subject_id, exam_type, semester,
                          internal_marks, external_marks, internal_max, external_max,
                          graded_by, graded_at, published_at)
       VALUES ($1,$2,$3,'SEMESTER',$4,$5,$6,40,60,$7, now(), now())
       ON CONFLICT (student_id, subject_id, exam_type, semester)
       DO UPDATE SET internal_marks = EXCLUDED.internal_marks,
                     external_marks = EXCLUDED.external_marks,
                     graded_by    = EXCLUDED.graded_by,
                     graded_at    = now(),
                     published_at = now()
       RETURNING 1`,
      [id, e.studentId, subjectId, semester, e.internal, e.external, user.id],
    );
    if (rowCount) {
      saved.push(e.studentId);
    } else {
      rejected.push({ studentId: e.studentId, reason: "not written" });
    }
  }

  // CGPA is derived state: recompute it for every student whose marks moved so
  // the stored snapshot can never drift from the marks that justify it.
  const recomputed: Array<{ studentId: string; cgpa: number | null }> = [];
  for (const studentId of saved) {
    const r = await recomputeCgpa(studentId, semester, q);
    recomputed.push({ studentId, cgpa: r?.cgpa ?? null });
  }

  return NextResponse.json({
    ok: true,
    saved: saved.length,
    rejected,
    recomputed,
    cgpaChanges: recomputed.filter((r) => r.cgpa != null),
  });
}
