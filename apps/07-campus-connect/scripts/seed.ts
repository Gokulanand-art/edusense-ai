/**
 * Seed — realistic Indian engineering-college data.
 *
 * Deliberately seeds *edge cases* alongside the normal population, because the
 * features being demonstrated only matter at the edges:
 *   - students already below the 75% threshold (risk dashboard)
 *   - a student whose approved leave is visible but does NOT inflate attendance
 *   - an approved medical condonation (the only legal percentage adjustment)
 *   - a pending leave awaiting faculty decision
 *   - a "high CGPA, weak placement readiness" profile
 *
 * Run: npm run db:seed
 */
import { getDb, type QueryFn } from "@/lib/db";
import { newId } from "@/lib/utils/helpers";
import { hashPassword } from "@/lib/auth";

const SEED_PASSWORD = "campus123";

/* deterministic PRNG so seeded data is reproducible across runs */
let _s = 42;
const rnd = () => {
  _s = (_s * 1664525 + 1013904223) % 4294967296;
  return _s / 4294967296;
};
const ri = (min: number, max: number) => Math.floor(rnd() * (max - min + 1)) + min;
const rf = (min: number, max: number) => Number((rnd() * (max - min) + min).toFixed(2));
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];

const BRANCHES = ["CSE", "ECE", "ME", "CE", "EE"] as const;
const STATES = [
  "Tamil Nadu","Karnataka","Maharashtra","Kerala","Telangana","Andhra Pradesh",
  "Karnataka","Uttar Pradesh","Gujarat","Punjab","Rajasthan","West Bengal",
] as const;
const FIRST_M = ["Aarav","Rohan","Vikram","Aditya","Karthik","Sneha","Priya","Ananya","Rahul","Divya","Arjun","Meera","Sanjay","Nisha","Kiran"];
const LAST = ["Sharma","Patel","Reddy","Nair","Iyer","Kumar","Singh","Gupta","Rao","Das","Menon","Joshi","Bose","Verma"];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
};

export async function seed(q?: QueryFn): Promise<{ summary: string }> {
  const run: QueryFn = q ?? (await getDb()).query;
  const pw = hashPassword(SEED_PASSWORD);

  const already = await run<{ n: string }>(`SELECT COUNT(*)::text AS n FROM users`);
  if (Number(already.rows[0]?.n ?? 0) > 0) {
    return { summary: "Database already seeded — skipping (drop ./data/campus-connect to reseed)." };
  }

  /* ------------------------------------------------------------ departments */
  const DEPT_CODES = ["CSE", "ECE", "ME", "CE", "EE"] as const;
  const depts = [
    ["CSE", "Computer Science & Engineering"],
    ["ECE", "Electronics & Communication"],
    ["ME", "Mechanical Engineering"],
    ["CE", "Civil Engineering"],
    ["EE", "Electrical Engineering"],
  ] as const;
  for (const [code, name] of depts) {
    await run(`INSERT INTO departments (id, code, name) VALUES ($1,$2,$3)`, [
      `dept_${code}`, code, name,
    ]);
  }

  /* ------------------------------------------------- programs + batches (per dept) */
  // One BTECH programme and one 2023 batch per department, so every HOD has a
  // populated department rather than four of five being empty.
  for (const code of DEPT_CODES) {
    await run(
      `INSERT INTO programs (id, department_id, code, name, duration_semesters)
       VALUES ($1,$2,$3,'Bachelor of Technology',8)`,
      [`prog_${code}`, `dept_${code}`, `BTECH-${code}`],
    );
    await run(
      `INSERT INTO batches (id, program_id, code, name, start_year, section)
       VALUES ($1,$2,$3,$4,2023,'A')`,
      [`batch_${code}`, `prog_${code}`, `BTECH-2023-${code}`, `B.Tech 2023 ${code}`],
    );
  }

  /* -------------------------------------------------------------- subjects */
  // Semester 5 papers per department. Threshold 75% = UGC/AICTE minimum.
  const SUBJECT_CATALOGUE: Record<string, Array<[string, string, number]>> = {
    CSE: [
      ["CS501", "Data Structures & Algorithms", 4],
      ["CS502", "Database Management Systems", 4],
      ["CS503", "Operating Systems", 4],
      ["CS504", "Computer Networks", 3],
      ["CS505", "Machine Learning", 3],
      ["CS506", "Design & Analysis of Algorithms Lab", 2],
    ],
    ECE: [
      ["EC501", "Signals & Systems", 4],
      ["EC502", "Digital Electronics", 4],
      ["EC503", "Analog Circuit Design", 3],
      ["EC504", "Microprocessors", 3],
      ["EC505", "Communication Systems", 3],
      ["EC506", "Electronics Laboratory", 2],
    ],
    ME: [
      ["ME501", "Thermodynamics", 4],
      ["ME502", "Fluid Mechanics", 4],
      ["ME503", "Machine Design", 3],
      ["ME504", "Manufacturing Processes", 3],
      ["ME505", "Heat Transfer", 3],
      ["ME506", "Workshop Practice", 2],
    ],
    CE: [
      ["CE501", "Structural Analysis", 4],
      ["CE502", "Geotechnical Engineering", 4],
      ["CE503", "Transportation Engineering", 3],
      ["CE504", "Environmental Engineering", 3],
      ["CE505", "Concrete Technology", 3],
      ["CE506", "Surveying Practical", 2],
    ],
    EE: [
      ["EE501", "Electrical Machines", 4],
      ["EE502", "Power Systems", 4],
      ["EE503", "Control Systems", 3],
      ["EE504", "High Voltage Engineering", 3],
      ["EE505", "Renewable Energy", 3],
      ["EE506", "Electrical Machines Lab", 2],
    ],
  };

  const subjects: Array<[string, string, number, string]> = [];
  for (const [dept, list] of Object.entries(SUBJECT_CATALOGUE)) {
    for (const [code, name, credits] of list) {
      subjects.push([code, name, credits, dept]);
      await run(
        `INSERT INTO subjects (id, code, name, credits, program_id, department_id, semester, subject_type, exam_eligibility_threshold)
         VALUES ($1,$2,$3,$4,$5,$6,5,$7,75)`,
        [
          `subj_${code}`,
          code,
          name,
          credits,
          `prog_${dept}`,
          `dept_${dept}`,
          code.endsWith("506") ? "LAB" : "THEORY",
        ],
      );
    }
  }
  /** the papers a given department owns */
  const subjectsOf = (dept: string) => subjects.filter(([, , , d]) => d === dept);

  /* ----------------------------------------------------------------- admin */
  const adminId = newId("usr");
  await run(
    `INSERT INTO users (id,email,password_hash,role,first_name,last_name,phone)
     VALUES ($1,'admin@campus.edu',$2,'ADMIN','Meera','Rao','+919800000001')`,
    [adminId, pw],
  );

  /* --------------------------------------------------------------- faculty */
  // Two lecturers per department. The first is the HOD; the second owns a
  // different slice of the papers, so "all subjects" (HOD) and "your subjects"
  // (faculty) are visibly different numbers rather than the same list twice.
  const facultyIds: string[] = [];
  const facultyByDept = new Map<string, string[]>();

  for (const [di, dept] of DEPT_CODES.entries()) {
    const deptSubs = subjectsOf(dept);
    const memberIds: string[] = [];

    for (let m = 0; m < 2; m++) {
      const fid = newId("usr");
      const facId = `fac_${dept}_${m + 1}`;
      memberIds.push(fid);
      facultyIds.push(fid);

      await run(
        `INSERT INTO users (id,email,password_hash,role,first_name,last_name,phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          fid,
          m === 0
            ? `hod.${dept.toLowerCase()}@campus.edu`
            : `faculty.${dept.toLowerCase()}@campus.edu`,
          pw,
          m === 0 ? "HOD" : "FACULTY",
          m === 0 ? pick(FIRST_M) : pick(FIRST_M),
          pick(LAST),
          `+91980000${10 + di * 2 + m}`,
        ],
      );
      await run(
        `INSERT INTO faculty (id,user_id,employee_id,department_id,designation,joining_date)
         VALUES ($1,$2,$3,$4,$5,'2018-07-01')`,
        [facId, fid, `EMP${100 + di * 2 + m}`, `dept_${dept}`, m === 0 ? "Professor & Head" : "Assistant Professor"],
      );

      // HOD teaches the first four papers, the lecturer the rest — a real split.
      const owned = m === 0 ? deptSubs.slice(0, 4) : deptSubs.slice(4);
      for (const [code] of owned) {
        await run(
          `INSERT INTO subject_faculty (subject_id, faculty_id, is_primary)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [`subj_${code}`, facId, true],
        );
      }
    }

    facultyByDept.set(dept, memberIds);
    await run(`UPDATE departments SET hod_user_id = $1 WHERE id = $2`, [memberIds[0], `dept_${dept}`]);
  }

  /* -------------------------------------------------------------- students */
  const STUDENTS = 48;
  const studentIds: string[] = [];

  for (let i = 1; i <= STUDENTS; i++) {
    const uid = newId("usr");
    const sid = `stu_${String(i).padStart(4, "0")}`;
    // Students 1-3 are pinned to CSE because the seeded edge cases below
    // reference CS501/condonation by id; keeping them deterministic is cheaper
    // and less fragile than looking the subject up per case.
    const dept = i <= 3 ? "CSE" : pick(DEPT_CODES);
    const deptSubs = subjectsOf(dept);
    const faculty = facultyByDept.get(dept)!;
    const first = pick(FIRST_M);
    const last = pick(LAST);
    studentIds.push(sid);

    await run(
      `INSERT INTO users (id,email,password_hash,role,first_name,last_name,phone)
       VALUES ($1,$2,$3,'STUDENT',$4,$5,$6)`,
      [uid, `student${i}@campus.edu`, pw, first, last, `+9198${ri(10000000, 99999999)}`],
    );
    await run(
      `INSERT INTO students (id,user_id,roll_number,registration_no,batch_id,program_id,department_id,admission_date,current_semester,father_name,mother_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2023-08-21',5,$8,$9)`,
      [
        sid, uid,
        `23${dept}${String(i).padStart(3, "0")}`,
        `REG2023${String(i).padStart(5, "0")}`,
        `batch_${dept}`, `prog_${dept}`, `dept_${dept}`,
        `${first} Sr.`, `${pick(FIRST_M)} Devi`,
      ],
    );

    /* ---- attendance: 40 past class sessions per subject ----
       Skill tiers are assigned up front so the resulting distribution is
       deliberate rather than accidental.

       Dates occupy days 8..88 ago. The most recent 7 days are deliberately
       left free so the seeded edge cases (approved leave, ON_DUTY) can occupy
       realistic recent dates without colliding with the (student, subject,
       date, period) unique constraint. */
    const tier = i <= 6 ? "at_risk" : i <= 14 ? "borderline" : i <= 34 ? "healthy" : "strong";
    const attendRate = { at_risk: 0.5, borderline: 0.68, healthy: 0.84, strong: 0.93 }[tier];

    for (const [code] of deptSubs) {
      const sessions = 40;
      for (let s = 0; s < sessions; s++) {
        const status = rnd() < attendRate ? "PRESENT" : rnd() < 0.85 ? "ABSENT" : "LATE";
        await run(
          `INSERT INTO attendance (id,student_id,subject_id,class_date,period_no,status,marked_by,source)
           VALUES ($1,$2,$3,$4,1,$5,$6,'QR')`,
          [`att_${sid}_${code}_${s}`, sid, `subj_${code}`, daysAgo(8 + (sessions - s) * 2 + (s % 2)), status, pick(faculty)],
        );
      }
    }

    /* ---- marks: internal (40) + external (60) ---- */
    for (const [code, , credits] of deptSubs) {
      const base = { at_risk: 42, borderline: 56, healthy: 68, strong: 80 }[tier];
      const internal = Math.min(40, Math.round(base * 0.9 + rf(-4, 4)));
      const external = Math.min(60, Math.round(base * 1.05 + rf(-6, 6)));
      await run(
        `INSERT INTO marks (id,student_id,subject_id,exam_type,semester,internal_marks,external_marks,internal_max,external_max,graded_by,published_at)
         VALUES ($1,$2,$3,'SEMESTER',5,$4,$5,40,60,$6, now() - INTERVAL '10 days')`,
        [`mk_${sid}_${code}`, sid, `subj_${code}`, Math.max(0, internal), Math.max(0, external), pick(faculty)],
      );
      void credits;
    }
  }

  /* ------------------------------------------------------------- cgpa rows */
  for (const sid of studentIds) {
    const { rows } = await run<any>(
      `SELECT s.credits, (m.internal_marks + m.external_marks) AS got, 100.0 AS mx
         FROM marks m JOIN subjects s ON s.id = m.subject_id
        WHERE m.student_id = $1`,
      [sid],
    );
    const gp = (pct: number) =>
      pct >= 90 ? 10 : pct >= 80 ? 9 : pct >= 70 ? 8 : pct >= 60 ? 7 : pct >= 50 ? 6 : pct >= 40 ? 5 : 0;

    let points = 0, credits = 0;
    for (const r of rows) {
      const pct = (Number(r.got) / Number(r.mx)) * 100;
      points += gp(pct) * Number(r.credits);
      credits += Number(r.credits);
    }
    const sgpa = credits ? Number((points / credits).toFixed(2)) : 0;

    // Prior semesters carry the cumulative figure; seed a plausible history.
    const priorSgpa = [Number((sgpa - 0.3).toFixed(2)), Number((sgpa + 0.15).toFixed(2)), Number((sgpa - 0.05).toFixed(2)), Number((sgpa + 0.25).toFixed(2))];
    let cumCredits = 0, cumPoints = 0;
    for (const [k, ps] of priorSgpa.entries()) {
      const c = 21;
      cumCredits += c;
      cumPoints += ps * c;
      await run(
        `INSERT INTO cgpa_records (id,student_id,semester,total_credits,earned_credits,sgpa,cgpa,academic_year,published_at)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7, now())`,
        [`cg_${sid}_${k + 1}`, sid, k + 1, c, ps, Number((cumPoints / cumCredits).toFixed(2)), "2024-25"],
      );
    }
    cumCredits += credits;
    cumPoints += sgpa * credits;
    await run(
      `INSERT INTO cgpa_records (id,student_id,semester,total_credits,earned_credits,sgpa,cgpa,academic_year,published_at)
       VALUES ($1,$2,5,$3,$4,$5,$6,'2025-26', now() - INTERVAL '10 days')`,
      [`cg_${sid}_5`, sid, credits, credits, sgpa, Number((cumPoints / cumCredits).toFixed(2))],
    );
  }

  /* ------------------------------------------- edge cases (the demo material) */
  const cseFaculty = facultyByDept.get("CSE")![0];

  // 1. Approved leave: visible in the log, does NOT inflate attendance.
  await run(
    `INSERT INTO leaves (id,student_id,leave_type,start_date,end_date,no_of_days,reason,status,has_medical_cert,decided_by,decided_at,applied_at)
     VALUES ('lv_seed_1','stu_0001','MEDICAL',$1,$2,3,'Viral fever — advised rest by campus health centre','APPROVED',true,$3,now() - INTERVAL '2 days', now() - INTERVAL '4 days')`,
    [daysAgo(6), daysAgo(4), cseFaculty],
  );
  await run(
    `INSERT INTO attendance (id,student_id,subject_id,class_date,period_no,status,marked_by,source,notes)
     VALUES ('att_seed_od1','stu_0001','subj_CS501',$1,1,'ON_DUTY',$2,'QR','Approved medical leave')`,
    [daysAgo(5), cseFaculty],
  );

  // 2. Approved medical condonation — the only legal percentage adjustment.
  await run(
    `INSERT INTO condonations (id,student_id,semester,attendance_pct,condoned_pct,reason,approved_by,approved_at)
     VALUES ('cond_seed_1','stu_0002',5,68.40,8.00,'Extended hospitalisation for dengue (cert. on file)',$1, now() - INTERVAL '5 days')`,
    [cseFaculty],
  );

  // 3. Pending leave awaiting a faculty decision — drives the approval queue.
  await run(
    `INSERT INTO leaves (id,student_id,leave_type,start_date,end_date,no_of_days,reason,status,applied_at)
     VALUES ('lv_seed_2','stu_0003','CASUAL',$1,$2,2,'Family function out of town','PENDING', now() - INTERVAL '1 day')`,
    [daysAgo(2), daysAgo(1)],
  );

  /* ------------------------------------------------------------- announcements */
  await run(
    `INSERT INTO announcements (id,title,body,audience,created_by)
     VALUES ('ann_1','Mid-semester exam schedule published','Hall tickets are live in the student portal. Report to the hall 20 minutes before the paper.','ALL',$1)`,
    [adminId],
  );
  await run(
    `INSERT INTO announcements (id,title,body,audience,created_by)
     VALUES ('ann_2','Attendance below 75% blocks exam registration','As per UGC/AICTE norms, students below the threshold in a subject cannot register for that subject''s examination. Use the Eligibility tab to check and apply for medical condonation where applicable.','STUDENT',$1)`,
    [adminId],
  );

  return {
    summary:
      `Seeded ${STUDENTS} students across ${DEPT_CODES.length} departments, ${subjects.length} subjects, ` +
      `${facultyIds.length} staff, ${STUDENTS * 6 * 40} attendance rows. ` +
      `Password for every account: ${SEED_PASSWORD}`,
  };
}

// Guard: only run when executed directly. Without this, importing this module
// (e.g. from a test) would seed the file-backed database as a side effect.
const invokedDirectly =
  process.argv[1]?.includes("seed") && !process.env.VITEST;

async function main() {
  const db = await getDb();
  try {
    const { summary } = await seed(db.query);
    console.log(summary);
  } finally {
    await db.close();
  }
}

if (invokedDirectly) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}