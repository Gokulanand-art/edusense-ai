/**
 * Import the real cohort from CSBS.xlsx (Centre for Training & Placement).
 *
 * Source sheet "GREEN Test", EXCEL ENGINEERING COLLEGE, SECOND YEAR STUDENTS
 * DETAILS: S.No | Roll No. | Name of the Student | Login Id | Password.
 *
 * Two deliberate decisions:
 *
 *  1. The Login Id becomes the app username. The sheet's Password column is
 *     NOT imported — those are live placement-portal credentials for 62 real
 *     students, and duplicating them into a second system is how credentials
 *     end up in a git history. Every imported student instead gets one shared
 *     default password, hashed, and must change it. Re-running with
 *     --use-sheet-passwords is available but off by default and prints nothing.
 *
 *  2. The sheet has no branch/branch-code column, so every student lands in CSE
 *     (the "CB" roll prefix is one cohort). Override with --dept if the mapping
 *     is wrong — this is the single assumption most likely to be wrong.
 *
 * Run: npx tsx scripts/import-csbs.ts --file "<path.xlsx>" [--dept CSE] [--reset]
 */
import { getDb, type QueryFn } from "@/lib/db";
import { newId } from "@/lib/utils/helpers";
import { hashPassword } from "@/lib/auth";
import { makeRng, assignTiers, generateAcademicRecords, MARK_BASE } from "./lib/academic-records";
import { projectLeaveImpact } from "../src/lib/services/attendance";

const DEFAULT_PASSWORD = "campus123";

interface SheetRow {
  sNo: string;
  roll: string;
  name: string;
  loginId: string;
  sheetPassword: string;
}

/* ------------------------------------------------------------------ xlsx io */

/**
 * Minimal XLSX reader: xlsx is a zip of XML, and pulling in a full parser for
 * one flat sheet would be the larger dependency. Handles inline strings,
 * shared strings, and numbers — everything this sheet uses.
 */
async function readXlsx(file: string): Promise<{ sheet: string; rows: unknown[][] }> {
  const { readFile } = await import("node:fs/promises");
  const JSZip = (await import("jszip")).default;
  const buf = await readFile(file);
  const zip = await JSZip.loadAsync(buf);

  const shared: string[] = [];
  const ssXml = zip.file("xl/sharedStrings.xml");
  if (ssXml) {
    const xml = await ssXml.async("string");
    for (const si of xml.match(/<si>[\s\S]*?<\/si>/g) ?? []) {
      shared.push(
        (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) ?? [])
          .map((t) => t.replace(/<[^>]+>/g, ""))
          .join("")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">"),
      );
    }
  }

  const wbXml = await zip.file("xl/workbook.xml")!.async("string");
  const sheetName = wbXml.match(/<sheet[^>]*name="([^"]+)"/)?.[1] ?? "Sheet1";

  const sheetPath = Object.keys(zip.files).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))!;
  const xml = await zip.file(sheetPath)!.async("string");

  const rows: unknown[][] = [];
  for (const rowXml of xml.match(/<row[\s\S]*?<\/row>/g) ?? []) {
    const cells: unknown[] = [];
    for (const c of rowXml.match(/<c[^>]*\/>|<c[\s\S]*?<\/c>/g) ?? []) {
      const ref = c.match(/r="([A-Z]+)\d+"/)?.[1] ?? "A";
      const col = [...ref].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
      const type = c.match(/t="([^"]+)"/)?.[1];
      let val: unknown = null;
      if (type === "inlineStr") {
        val = (c.match(/<t[^>]*>([\s\S]*?)<\/t>/) ?? [])[1] ?? "";
      } else {
        const v = c.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v != null) val = type === "s" ? shared[Number(v)] : Number.isNaN(Number(v)) ? v : Number(v);
      }
      cells[col] = val;
    }
    rows.push(cells);
  }
  return { sheet: sheetName, rows };
}

/** Locate the header row rather than assuming it's row 1 — the sheet has 3 title rows. */
function findHeader(rows: unknown[][]): number {
  return rows.findIndex((r) =>
    (r ?? []).some((c) => typeof c === "string" && /roll\s*no/i.test(c)),
  );
}

function parse(rows: unknown[][]): SheetRow[] {
  const h = findHeader(rows);
  if (h < 0) throw new Error("Could not find a 'Roll No.' header row in the sheet.");
  const col = (name: RegExp, fallback: number) => {
    const idx = (rows[h] ?? []).findIndex((c) => typeof c === "string" && name.test(c));
    return idx >= 0 ? idx : fallback;
  };
  const iRoll = col(/roll\s*no/i, 1);
  const iName = col(/name/i, 2);
  const iLogin = col(/login/i, 3);
  const iPass = col(/password/i, 4);

  const out: SheetRow[] = [];
  for (const r of rows.slice(h + 1)) {
    const roll = String(r?.[iRoll] ?? "").trim();
    const name = String(r?.[iName] ?? "").trim();
    const loginId = String(r?.[iLogin] ?? "").trim();
    if (!roll || !name) continue;
    out.push({ sNo: String(r?.[0] ?? ""), roll, name, loginId, sheetPassword: String(r?.[iPass] ?? "").trim() });
  }
  return out;
}

/**
 * "ARUN KUMAR" -> ["ARUN","KUMAR"]; "GOKILADEVI.V" -> ["GOKILADEVI","V"]
 * (examples are illustrative; real names are read from the xlsx at runtime).
 * A single-token name (no last name) must not produce an empty family name.
 */
function splitName(full: string): [string, string] {
  const t = full.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.*?)[\s.]+(\S+)$/);
  if (!m) return [t, ""];
  return [m[1].trim(), m[2].trim()];
}

/* ---------------------------------------------------------------- the import */

export async function importCsbs(opts: {
  file: string;
  dept?: string;
  reset?: boolean;
  useSheetPasswords?: boolean;
  q?: QueryFn;
}): Promise<string[]> {
  const run: QueryFn = opts.q ?? (await getDb()).query;
  const dept = (opts.dept ?? "CSE").toUpperCase();
  const log: string[] = [];

  const { sheet, rows } = await readXlsx(opts.file);
  const students = parse(rows);
  log.push(`Sheet "${sheet}": ${students.length} student rows parsed`);

  const dupeRolls = students.filter((s, i) => students.findIndex((x) => x.roll === s.roll) !== i);
  if (dupeRolls.length) throw new Error(`Duplicate roll numbers in sheet: ${dupeRolls.map((d) => d.roll).join(", ")}`);
  const dupeLogins = students.filter((s) => s.loginId && students.findIndex((x) => x.loginId === s.loginId) !== students.indexOf(s));
  if (dupeLogins.length) throw new Error(`Duplicate login ids in sheet: ${dupeLogins.map((d) => d.loginId).join(", ")}`);

  const { rows: deptRow } = await run<{ id: string }>(
    `SELECT id FROM departments WHERE code = $1`,
    [dept],
  );
  const deptId = deptRow[0]?.id;
  if (!deptId) throw new Error(`Department ${dept} does not exist — run the seed first.`);

  const { rows: prog } = await run<{ program_id: string; batch_id: string }>(
    `SELECT p.id AS program_id, (SELECT b.id FROM batches b WHERE b.program_id = p.id LIMIT 1) AS batch_id
       FROM programs p WHERE p.department_id = $1 LIMIT 1`,
    [deptId],
  );
  const programId = prog[0]?.program_id;
  const batchId = prog[0]?.batch_id;
  if (!programId || !batchId) throw new Error(`No programme/batch for ${dept} — run the seed first.`);

  const { rows: subs } = await run<{ code: string }>(
    `SELECT code FROM subjects WHERE department_id = $1 ORDER BY code`,
    [deptId],
  );
  const subjectCodes = subs.map((s) => s.code);

  const { rows: facs } = await run<{ user_id: string }>(
    `SELECT user_id FROM faculty WHERE department_id = $1 AND is_active`,
    [deptId],
  );
  const facultyIds = facs.map((f) => f.user_id);
  if (!subjectCodes.length || !facultyIds.length) {
    throw new Error(`Department ${dept} has no subjects or faculty — cannot generate records.`);
  }

  /* Keep the Excel cohort as the CSE roster: drop previously generated CSE
     students so the HOD sees the real 62 rather than 62 + synthetic leftovers.
     Their attendance/marks cascade with the user row. */
  if (opts.reset) {
    const removed = await run<{ n: string }>(
      `WITH k AS (DELETE FROM users WHERE role='STUDENT' AND id IN
                   (SELECT u.id FROM users u JOIN students s ON s.user_id=u.id
                     WHERE s.department_id = $1)
                 RETURNING 1)
       SELECT COUNT(*)::text AS n FROM k`,
      [deptId],
    );
    log.push(`Removed ${Number(removed.rows[0]?.n ?? 0)} previously generated ${dept} student account(s)`);
  }

  const rng = makeRng(2026);
  const tiers = assignTiers(students.length);
  const defaultHash = hashPassword(DEFAULT_PASSWORD);

  /* Coursework: two assignments per real subject, so the LMS panel has content
     tied to subjects that genuinely carry marks and attendance. */
  const { rows: existingAsg } = await run<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM course_assignments`,
  );
  if (Number(existingAsg[0]?.n ?? 0) === 0) {
    const TITLES: Array<[string, string, number]> = [
      ["Problem Set 1", "Solve the exercises on pages 12-18 and submit your worked solutions.", 12],
      ["Mini Project", "Build a small demonstrator for the concepts covered so far.", 26],
    ];
    let made = 0;
    for (const code of subjectCodes) {
      for (let a = 0; a < TITLES.length; a++) {
        const [title, description, dueIn] = TITLES[a];
        await run(
          `INSERT INTO course_assignments (id,subject_id,title,description,due_date,max_marks,priority)
           VALUES ($1,$2,$3,$4,current_date + $5::int,100,$6)
           ON CONFLICT DO NOTHING`,
          [
            `asg_${code}_${a + 1}`,
            `subj_${code}`,
            title,
            description,
            dueIn,
            a === 0 ? "HIGH" : "NORMAL",
          ],
        );
        made++;
      }
    }
    log.push(`Created ${made} assignment(s) across ${subjectCodes.length} subject(s)`);
  }

  let imported = 0;
  let reused = 0;
  const tierCount: Record<string, number> = {};

  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const [first, last] = splitName(s.name);
    const tier = tiers[i];
    tierCount[tier] = (tierCount[tier] ?? 0) + 1;
    const username = (s.loginId || s.roll).toLowerCase();
    const pwHash = opts.useSheetPasswords && s.sheetPassword ? hashPassword(s.sheetPassword) : defaultHash;

    const existing = await run<{ id: string }>(
      `SELECT u.id FROM users u JOIN students st ON st.user_id = u.id WHERE lower(u.email) = $1`,
      [`${username}@excel.edu`],
    );
    if (existing.rows[0]) {
      reused++;
      continue;
    }

    const uid = newId("usr");
    const sid = `stu_csbs_${s.roll.toLowerCase()}`;

    await run(
      `INSERT INTO users (id,email,password_hash,role,first_name,last_name,phone,is_active)
       VALUES ($1,$2,$3,'STUDENT',$4,$5,NULL,true)`,
      [uid, `${username}@excel.edu`, pwHash, first, last],
    );
    await run(
      `INSERT INTO students (id,user_id,roll_number,registration_no,batch_id,program_id,department_id,
                             admission_date,current_semester,father_name,mother_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'2024-08-05',5,NULL,NULL)`,
      [sid, uid, s.roll.toUpperCase(), s.roll.toUpperCase(), batchId, programId, deptId],
    );

    await generateAcademicRecords(run, {
      studentId: sid,
      subjectCodes,
      facultyIds,
      tier,
      rng,
      idPrefix: sid,
      newestSessionDaysAgo: 0,
    });

    /* Submission state follows the student's tier, so a strong student's LMS
       list and their grade list tell the same story. */
    for (const code of subjectCodes) {
      for (let a = 1; a <= 2; a++) {
        const done =
          tier === "strong" ? true : tier === "healthy" ? rng.rnd() < 0.8 : tier === "borderline" ? rng.rnd() < 0.5 : rng.rnd() < 0.25;
        const status = done ? (rng.rnd() < 0.7 ? "GRADED" : "SUBMITTED") : "PENDING";
        await run(
          `INSERT INTO assignment_submissions (id,assignment_id,student_id,status,score,submitted_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (assignment_id, student_id) DO NOTHING`,
          [
            `sub_${sid}_${code}_${a}`,
            `asg_${code}_${a}`,
            sid,
            status,
            status === "GRADED" ? Math.min(100, Math.round(MARK_BASE[tier] + rng.rf(-8, 8))) : null,
            done ? new Date(Date.now() - rng.ri(1, 20) * 86400000).toISOString() : null,
          ],
        );
      }
    }

    imported++;
  }

  /* The --reset above cascades the seeded leaves away, which would leave the
     HOD's primary action (approving leave) with nothing to act on. Recreate a
     small pending queue on real imported students. */
  if (imported > 0) {
    const { rows: pend } = await run<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM leaves WHERE status = 'PENDING'`,
    );
    if (Number(pend[0]?.n ?? 0) === 0) {
      const { rows: cohort } = await run<{ id: string }>(
        `SELECT id FROM students WHERE id LIKE 'stu_csbs_%' ORDER BY roll_number LIMIT 3`,
      );
      const reasons = [
        ["MEDICAL", "Viral fever — advised rest by the campus health centre"],
        ["CASUAL", "Family function out of town"],
        ["ON_DUTY", "Department sports meet"],
      ];
      for (let i = 0; i < cohort.length; i++) {
        const [type, reason] = reasons[i];
        const startOffset = i === 0 ? -1 : i + 1;
        const days = i === 0 ? 2 : 1;
        // Snapshot the real projection. Writing zeros here would show the HOD a
        // "0.0% projected" pill — i.e. every leave looking like a total collapse
        // in attendance — and would silently bypass the 75% breach guard.
        const impact = await projectLeaveImpact(cohort[i].id, days, run);
        await run(
          `INSERT INTO leaves (id,student_id,leave_type,start_date,end_date,no_of_days,reason,status,impact_snapshot)
           VALUES ($1,$2,$3,current_date + $4::int, current_date + ($4::int + $5::int), $5::int, $6,'PENDING',$7)
           ON CONFLICT DO NOTHING`,
          [
            `lv_csbs_${i + 1}`,
            cohort[i].id,
            type,
            startOffset,
            days,
            reason,
            JSON.stringify({
              overallCurrent: impact.overallCurrent,
              overallProjected: impact.overallProjected,
              overallWillBreach: impact.overallWillBreach,
              riskLevel: impact.riskLevel,
              perSubject: impact.perSubject.map((s) => ({
                code: s.code,
                current: s.current,
                projected: s.projected,
                willBreach: s.willBreach,
              })),
            }),
          ],
        );
      }
      log.push(`Recreated ${cohort.length} pending leave request(s) for the approval queue`);
    }
  }

  log.push(`Imported ${imported} student(s), skipped ${reused} already present`);
  log.push(`Cohort spread — ${Object.entries(tierCount).map(([k, v]) => `${k}:${v}`).join(", ")}`);
  log.push(`Every student logs in with Login Id (G###) + password "${DEFAULT_PASSWORD}" and must change it`);
  log.push(`Sheet passwords were NOT imported.${opts.useSheetPasswords ? " (--use-sheet-passwords WAS set)" : ""}`);
  log.push(`All ${students.length} student(s) mapped to department ${dept} — the sheet has no branch column`);
  return log;
}

/* --------------------------------------------------------------------- cli */

const isMain = process.argv[1]?.includes("import-csbs");
if (isMain) {
  void (async () => {
    const argv = process.argv.slice(2);
    const arg = (name: string) => {
      const i = argv.indexOf(`--${name}`);
      return i >= 0 ? argv[i + 1] : undefined;
    };
    const file = arg("file");
    if (!file) {
      console.error(
        "Usage: npx tsx scripts/import-csbs.ts --file <path.xlsx> [--dept CSE] [--reset] [--use-sheet-passwords]",
      );
      process.exit(1);
    }
    try {
      const out = await importCsbs({
        file,
        dept: arg("dept"),
        reset: argv.includes("--reset"),
        useSheetPasswords: argv.includes("--use-sheet-passwords"),
      });
      console.log(out.join("\n"));
      const db = await getDb();
      await db.close();
      process.exit(0);
    } catch (err) {
      console.error("Import failed:", err instanceof Error ? err.message : err);
      process.exit(1);
    }
  })();
}
