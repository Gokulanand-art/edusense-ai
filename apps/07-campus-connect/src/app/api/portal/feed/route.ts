/**
 * Single feed for the vendored 06-campus-portal UI.
 *
 * The portal is a static multi-page shell with `data-slot="..."` placeholders.
 * One endpoint rather than ~15 keeps it to one fetch per page load and, more
 * importantly, keeps the department scope decision in exactly one place:
 * `deptId` is derived from the session, never from the request.
 *
 * Role mapping (portal vocabulary -> campus-connect roles):
 *   student -> STUDENT
 *   hod     -> HOD
 *   admin   -> FACULTY and ADMIN   ("staff login" in the portal shell)
 */
import { NextResponse } from "next/server";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { getDb, type QueryFn } from "@/lib/db";
import {
  deptKpis,
  deptSubjects,
  deptAtRisk,
  deptLeaves,
  deptFaculty,
} from "@/lib/services/department";

export const dynamic = "force-dynamic";

type PortalRole = "admin" | "hod" | "student";

function portalRole(u: SessionUser): PortalRole {
  if (u.role === "STUDENT") return "student";
  if (u.role === "HOD") return "hod";
  return "admin";
}

const pct = (n: unknown) => Number(n ?? 0);
const num = (n: unknown, d = 0) => {
  const v = Number(n);
  return Number.isFinite(v) ? v : d;
};

/** Indian 10-point band from a percentage. */
function band(p: number): string {
  if (p >= 90) return "O";
  if (p >= 80) return "A+";
  if (p >= 70) return "A";
  if (p >= 60) return "B";
  if (p >= 50) return "C";
  if (p >= 40) return "D";
  return "F";
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const role = portalRole(user);
  const db = await getDb();
  const q: QueryFn = db.query;

  const feed: Record<string, unknown> = {
    role,
    user: {
      name: `${user.firstName} ${user.lastName}`.trim(),
      firstName: user.firstName,
      email: user.email,
      sub:
        role === "student"
          ? "Student · portal login"
          : role === "hod"
            ? `HOD · ${user.departmentCode ?? ""} department`.trim()
            : "Admin · staff login",
      department: user.departmentCode ?? null,
    },
    library: { catalog: [], mine: [], dues: [] },
  };

  /* ------------------------------------------------------------- student */
  if (role === "student" && user.studentId) {
    const sid = user.studentId;

    const overall = await q<any>(
      `SELECT COALESCE(ROUND(AVG(v.effective_percentage),2),0) pct,
              COALESCE(SUM(v.attended),0) attended,
              COALESCE(SUM(v.held),0) held
         FROM v_attendance_status v WHERE v.student_id = $1`,
      [sid],
    );
    const o = overall.rows[0] ?? {};
    const attendancePct = pct(o.pct);

    const subs = await q<any>(
      `SELECT v.subject_code code, v.subject_name name, v.percentage,
              v.effective_percentage eff, v.is_below_threshold below
         FROM v_attendance_status v
         WHERE v.student_id = $1 ORDER BY v.effective_percentage ASC`,
      [sid],
    );

    const trend = await q<any>(
      `SELECT to_char(date_trunc('week', a.class_date), 'DD-Mon') label,
              ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))
                    / NULLIF(COUNT(*),0), 1) pct
         FROM attendance a
        WHERE a.student_id = $1 AND a.class_date >= current_date - interval '56 days'
        GROUP BY 1 ORDER BY 1`,
      [sid],
    );

    const monthly = await q<any>(
      `SELECT to_char(date_trunc('month', a.class_date), 'Mon') month_name,
              COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::int present,
              COUNT(*)::int total
         FROM attendance a
        WHERE a.student_id = $1
        GROUP BY 1 ORDER BY min(a.class_date)`,
      [sid],
    );

    // A streak counts consecutive DAYS, not sessions. Six subjects share each
    // calendar day, so rank the distinct present days first — ranking raw rows
    // made every day look like six separate days and the streak always 0.
    const streak = await q<{ n: string }>(
      `WITH present_days AS (
         SELECT DISTINCT class_date
           FROM attendance
          WHERE student_id = $1 AND status IN ('PRESENT','LATE')
       ), ranked AS (
         SELECT current_date - class_date AS gap,
                ROW_NUMBER() OVER (ORDER BY class_date DESC) AS rn
           FROM present_days
       )
       SELECT COALESCE(MAX(rn),0)::text AS n
         FROM ranked
        WHERE gap <= rn - 1`,
      [sid],
    );

    const grades = await q<any>(
      `SELECT s.code, s.name, s.credits, m.internal_marks, m.external_marks,
              (m.internal_marks + m.external_marks) got,
              ROUND(100.0 * (m.internal_marks + m.external_marks) / 100.0, 2) pct
         FROM marks m JOIN subjects s ON s.id = m.subject_id
        WHERE m.student_id = $1 AND m.semester = 5
        ORDER BY pct DESC`,
      [sid],
    );

    const profile = await q<any>(
      `SELECT u.first_name, u.last_name, u.phone, s.roll_number, s.registration_no,
              s.father_name, s.mother_name, d.name dept, b.name batch, s.current_semester
         FROM students s JOIN users u ON u.id = s.user_id
         JOIN departments d ON d.id = s.department_id
         LEFT JOIN batches b ON b.id = s.batch_id
        WHERE s.id = $1`,
      [sid],
    );
    const pr = profile.rows[0] ?? {};

    const asg = await q<any>(
      `SELECT a.title, a.due_date, a.priority, a.max_marks, s.code subject,
              sub.status, sub.score
         FROM assignment_submissions sub
         JOIN course_assignments a ON a.id = sub.assignment_id
         JOIN subjects s ON s.id = a.subject_id
        WHERE sub.student_id = $1
        ORDER BY a.due_date`,
      [sid],
    );

    const cg = await q<{ cgpa: string }>(
      `SELECT cgpa FROM cgpa_records WHERE student_id = $1 ORDER BY semester DESC LIMIT 1`,
      [sid],
    );

    feed.kpi = {
      myAttendance: attendancePct,
      myAverage: num(cg.rows[0]?.cgpa),
      myPending: asg.rows.filter((r) => r.status === "PENDING").length,
      myDues: 0,
    };
    feed.myAttendance = {
      pct: attendancePct,
      attended: num(o.attended),
      held: num(o.held),
      streak: num(streak.rows[0]?.n),
      subjects: subs.rows.map((r) => ({
        code: r.code,
        name: r.name,
        pct: pct(r.eff),
        below: r.below === true,
      })),
      trend: trend.rows,
      monthly: monthly.rows.map((m) => ({ ...m, pct: pct(m.total) ? Math.round((num(m.present) / num(m.total)) * 1000) / 10 : 0 })),
    };
    const myGrades = grades.rows.map((g) => ({
      code: g.code,
      name: g.name,
      credits: num(g.credits),
      got: num(g.got),
      max: 100,
      pct: pct(g.pct),
      band: band(pct(g.pct)),
    }));
    feed.myGrades = myGrades;
    feed.myAssignments = asg.rows.map((a) => ({
      title: a.title,
      subject: a.subject,
      due: a.due_date,
      priority: a.priority,
      status: a.status,
      score: a.score == null ? null : num(a.score),
    }));
    feed.mySubjects = myGrades;
    feed.myProgress = myGrades.map((g) => ({ code: g.code, pct: g.pct, band: g.band }));

    // "Enrolled Courses" is a card the student sees too, so derive it from the
    // student's own subjects rather than leaving the slot empty.
    feed.courses = subs.rows.map((r) => ({
      code: r.code,
      name: r.name,
      students: null,
      completion: pct(r.eff),
    }));
    feed.me = {
      name: `${pr.first_name ?? ""} ${pr.last_name ?? ""}`.trim(),
      adm: pr.roll_number ?? "—",
      class: `${pr.dept ?? ""} · Sem ${pr.current_semester ?? "—"}`,
      guardian: pr.father_name || pr.mother_name || "—",
      phone: pr.phone || "—",
    };
    return NextResponse.json(feed);
  }

  /* ------------------------------------------------------- staff / HOD */
  const deptId = user.departmentId;
  // Admin without a department sees the whole college; HOD/faculty are always
  // pinned to their own. Never widen a faculty member by omitting the filter.
  const allDepts = user.role === "ADMIN" && !deptId;
  const scopeId = deptId ?? null;

  const [kpis, subjects, atRisk, faculty] = allDepts
    ? [null, [], [], []]
    : await Promise.all([
        deptKpis(scopeId as string, null, q),
        deptSubjects(scopeId as string, null, q),
        deptAtRisk(scopeId as string, null, q),
        deptFaculty(scopeId as string, q),
      ]);

  const leaves = scopeId ? await deptLeaves(scopeId, "PENDING", q) : [];

  /* roster */
  const roster = await q<any>(
    allDepts
      ? `SELECT s.roll_number adm, u.first_name || ' ' || u.last_name name,
                d.code class, COALESCE(g.cgpa,0) cgpa,
                COALESCE(AVG(v.effective_percentage),0) att
           FROM students s JOIN users u ON u.id = s.user_id
           JOIN departments d ON d.id = s.department_id
           LEFT JOIN cgpa_records g ON g.student_id = s.id AND g.semester = 5
           LEFT JOIN v_attendance_status v ON v.student_id = s.id
          WHERE s.is_active GROUP BY 1,2,3,4 ORDER BY 1 LIMIT 500`
      : `SELECT s.roll_number adm, u.first_name || ' ' || u.last_name name,
                d.code class, COALESCE(g.cgpa,0) cgpa,
                COALESCE(AVG(v.effective_percentage),0) att
           FROM students s JOIN users u ON u.id = s.user_id
           JOIN departments d ON d.id = s.department_id
           LEFT JOIN cgpa_records g ON g.student_id = s.id AND g.semester = 5
           LEFT JOIN v_attendance_status v ON v.student_id = s.id
          WHERE s.is_active AND s.department_id = $1
          GROUP BY 1,2,3,4 ORDER BY 1 LIMIT 500`,
    allDepts ? [] : [scopeId],
  );

  const toScore = (cg: number, att: number) => Math.round((num(cg) * 10 * 0.6 + pct(att) * 0.4));
  const students = roster.rows.map((r) => {
    const score = toScore(r.cgpa, r.att);
    return {
      adm: r.adm,
      name: r.name,
      class: r.class,
      score,
      band: band(score),
      attendance: Math.round(pct(r.att) * 10) / 10,
      cgpa: num(r.cgpa),
    };
  });
  feed.students = students;

  const kpi = {
    totalStudents: students.length,
    avgScore:
      students.length > 0
        ? Math.round(students.reduce((s, r) => s + r.score, 0) / students.length)
        : 0,
    attendanceToday: 0,
    atRisk: atRisk.length,
    pendingLeaves: leaves.length,
  };
  feed.kpi = kpi;
  const todayRows = allDepts
    ? await q<{ n: string }>(`SELECT COUNT(*)::text n FROM attendance WHERE class_date = current_date`)
    : await q<{ n: string }>(
        `SELECT COUNT(*)::text n FROM attendance a JOIN subjects s ON s.id = a.subject_id
          WHERE a.class_date = current_date AND s.department_id = $1`,
        [scopeId],
      );
  kpi.attendanceToday = num(todayRows.rows[0]?.n);

  /* attendance analytics */
  const trend = scopeId
    ? await q<any>(
        `SELECT to_char(date_trunc('week', a.class_date),'DD-Mon') label,
                ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))
                      / NULLIF(COUNT(*),0),1) pct
           FROM attendance a JOIN subjects s ON s.id = a.subject_id
          WHERE s.department_id = $1 AND a.class_date >= current_date - interval '56 days'
          GROUP BY 1 ORDER BY 1`,
        [scopeId],
      )
    : { rows: [] };

  const byClass = await q<any>(
    allDepts
      ? `SELECT s.code class, COUNT(*)::int total,
                ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE')) / NULLIF(COUNT(*),0),1) pct
           FROM attendance a JOIN subjects s ON s.id = a.subject_id GROUP BY 1 ORDER BY 1`
      : `SELECT s.code class, COUNT(*)::int total,
                ROUND(100.0 * COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE')) / NULLIF(COUNT(*),0),1) pct
           FROM attendance a JOIN subjects s ON s.id = a.subject_id
          WHERE s.department_id = $1 GROUP BY 1 ORDER BY 1`,
    allDepts ? [] : [scopeId],
  );

  const monthly = await q<any>(
    `SELECT to_char(date_trunc('month', a.class_date),'Mon') month_name,
            COUNT(*) FILTER (WHERE a.status IN ('PRESENT','LATE'))::int present,
            COUNT(*)::int total
       FROM attendance a JOIN subjects s ON s.id = a.subject_id
      ${allDepts ? "" : "WHERE s.department_id = $1"}
      GROUP BY 1 ORDER BY min(a.class_date)`,
    allDepts ? [] : [scopeId],
  );

  feed.attendance = {
    trend: trend.rows,
    summary: byClass.rows,
    monthly: monthly.rows.map((m) => ({
      ...m,
      pct: num(m.total) ? Math.round((num(m.present) / num(m.total)) * 1000) / 10 : 0,
    })),
    byStudent: students,
  };

  /* grades + risk distribution */
  const dist = new Map<string, number>();
  for (const r of students) dist.set(r.band, (dist.get(r.band) ?? 0) + 1);
  feed.grades = {
    recent: subjects.map((s: any) => ({
      code: s.code,
      name: s.name,
      avgMarks: s.avgMarks,
      passRate: s.passRate,
      atRisk: s.atRisk,
    })),
    distribution: [...dist.entries()].map(([b, count]) => ({ band: b, count })),
    riskBands: [
      { band: "CRITICAL", count: atRisk.filter((a: any) => a.severity === "CRITICAL").length },
      { band: "HIGH", count: atRisk.filter((a: any) => a.severity === "HIGH").length },
      { band: "WATCH", count: atRisk.filter((a: any) => a.severity === "WATCH").length },
    ],
    subjects,
  };

  feed.atRisk = atRisk;
  feed.leaves = leaves;
  feed.faculty = faculty;
  feed.courses = subjects.map((s: any) => ({
    code: s.code,
    name: s.name,
    credits: s.credits,
    students: s.students,
    completion: pct(s.avgAttendance),
  }));

  const asg = await q<any>(
    allDepts
      ? `SELECT a.title, a.due_date, a.priority, s.code subject FROM course_assignments a
         JOIN subjects s ON s.id = a.subject_id ORDER BY a.due_date`
      : `SELECT a.title, a.due_date, a.priority, s.code subject FROM course_assignments a
         JOIN subjects s ON s.id = a.subject_id WHERE s.department_id = $1 ORDER BY a.due_date`,
    allDepts ? [] : [scopeId],
  );
  feed.assignments = asg.rows.map((a) => ({ ...a, due: a.due_date }));

  const notices = await q<any>(
    `SELECT title, body, created_at FROM announcements ORDER BY created_at DESC LIMIT 10`,
  );
  feed.notices = notices.rows.map((n) => ({ ...n, date: n.published_at }));

  feed.sources = {
    students: { connected: true, label: "CSBS.xlsx cohort", count: students.length },
    attendance: { connected: true, label: "Register · generated", count: byClass.rows.length },
    assessments: { connected: true, label: "Gradebook · generated", count: (subjects as any[]).length },
    lmsLibrary: { connected: false, label: "Not connected", count: 0 },
  };

  if (kpis) feed.departmentKpis = kpis;
  return NextResponse.json(feed);
}
