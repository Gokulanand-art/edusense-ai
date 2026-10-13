# 07 — Campus Connect

Attendance intelligence for a single department. HODs see the whole cohort,
faculty see only the papers they teach, students see only their own record.

Next.js 14 (App Router) · React 18 · TypeScript · Tailwind · PostgreSQL / PGlite

## What it does

**Department dashboards** — students, attendance, subject performance, faculty
roster, and a leave-approval queue with the 75% threshold enforced.

**Attendance impact** — not just "you are at 72%", but what each class cost:
a per-session table showing the running percentage before and after every
session and the percentage points it moved, plus what the next class would do
either way.

**Marks entry and CGPA** — teaching staff enter internal/external marks for the
papers they own. Every save recomputes the affected students' SGPA and
cumulative CGPA, so a stored transcript can never drift from the marks behind it.

**Leave with impact projection** — students see the attendance consequence
before applying; staff see it before approving, and approval that breaches exam
eligibility requires an explicit, audited override.

## Running it

```bash
npm install
npm run db:reset      # schema + demo data (no real people)
npm run build
npm run start         # http://localhost:4000
```

`npm run dev` for hot reload. `npm test` and `npm run typecheck` for the checks.

There is no external database to install: without `DATABASE_URL` the app uses an
embedded PGlite database under `./data/`. Set `DATABASE_URL` for anything shared.

## Importing a real cohort

The import reads a placement register (`.xlsx`) and creates student accounts.

```bash
npm run import:csbs -- --file /path/to/register.xlsx --reset
```

**The spreadsheet is never committed.** It holds real students' names, roll
numbers and login IDs — it is excluded by `.gitignore`, along with `./data/` and
the generated `CREDENTIALS.txt`. Keep the file local.

Two deliberate choices:

- The register's **login ID becomes the username**; its **password column is not
  imported**. Those are live credentials for real people, and copying them into a
  second system is how they end up in a git history. Every imported student gets
  one shared default password instead.
- The sheet has no branch column, so every student lands in one department. Pass
  `--dept ECE` (etc.) if that mapping is wrong.

Re-running is safe: existing students are skipped.

## Demo accounts

All use the password `campus123`. Sign-in accepts an email address, a login ID,
or a roll number.

| Role | Identifier |
|---|---|
| Head of department | `hod.cse@campus.edu` |
| Faculty | `faculty.cse@campus.edu` |
| Student | `24CS001` or `G001` |
| Administrator | `admin@campus.edu` |

## Scope enforcement

Department scope is derived from the signed session on the server, never from
the URL or anything the browser sends:

- a lecturer can only grade subjects in their own `subject_faculty` rows
- a lecturer or HOD can only write marks for students in their own department
- a leave decision outside the caller's department returns **404**, so the
  endpoint does not confirm that it exists
- approving a leave that breaches the 75% threshold needs an explicit override,
  which is written to the audit log

## Layout

```
src/app/            routes: /dashboard/{hod,faculty,student,admin}, /api/*
src/lib/auth.ts     cookie sessions, role -> home
src/lib/services/   attendance, marks, department analytics, leave impact
src/lib/migrations  idempotent SQL schema
src/components/     shell, dashboard primitives, charts
scripts/            seed, cohort import, record generators
tests/              vitest — services and the scoping boundaries
```

## Licence / attribution

Independent app. See the repository root `ATTRIBUTION.md` for the other apps.
