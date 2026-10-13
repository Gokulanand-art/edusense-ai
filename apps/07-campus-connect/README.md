# Campus Connect

College management built around the one thing existing ERPs get wrong: **students
cannot see what a leave will cost them before they apply for it.**

MyCamu, Camu and most college ERPs show attendance *after the fact*. A student
takes leave, comes back, and discovers their percentage dropped and they may have
lost exam eligibility. Campus Connect projects the impact first, snapshots the
projection the student acted on, and blocks exam registration deterministically
against the published threshold.

```
Login        any seeded account, password: campus123
Dev server   npm run dev     → http://localhost:4000
```

---

## The core idea

```
attendance events ──► v_attendance_status (SQL view)
                          │
                          ├─► per-subject %  + condonation
                          ├─► exam-eligibility gate (75% UGC/AICTE)
                          └─► leave-impact projection  ◄── the feature
                                   │
                                   └─► snapshotted onto leaves.impact_snapshot
```

Definitions are pinned because different colleges mean different things by
"attendance", and mixing them is the main source of disputed numbers:

| Term | Meaning |
|---|---|
| `held` | classes the student was enrolled for |
| `attended` | `PRESENT` or `LATE` |
| `excused` | `ON_DUTY` / `EXCUSED` — approved leave: **held, but not attended** |
| `percentage` | `attended / held × 100` |
| `effective_percentage` | `percentage + approved condonation` |

An approved leave is recorded and visible but **does not inflate attendance**.
Condonation is the only thing that adjusts a percentage, and it is capped at 10%
with a named approver and a written reason.

---

## Leave impact — the differentiator

`projectLeaveImpact(studentId, days)` returns, per subject and overall:

- current %, projected %, and the delta in percentage points
- whether the subject would breach its own threshold
- classes missed, derived from that subject's **observed meeting cadence**
  (trailing 60 days), not a flat guess
- overall risk band + a plain-language summary

Real output from the seeded at-risk student:

```
59.34% → 55.21%  (−4.13 pts)  risk=CRITICAL
A 3-day leave reduces overall attendance by 4.13 percentage points.
Overall attendance would fall below the 75% eligibility threshold.
6 subjects would breach the per-subject threshold, worst being CS503 at 46.51%.
```

The projection is computed **server-side on every change** and snapshotted onto
the leave row at apply time, so the number the student saw and the number the
request was judged against cannot drift apart.

---

## Data layer

No Postgres server is installed on this machine (`psql`/`postgres` absent), so
Prisma + PostgreSQL is unusable. The adapter follows the proven pattern already
in `hackathon/lib/db.ts`:

- `pg` Pool when `DATABASE_URL` is set (Supabase / Neon / self-hosted)
- **`pglite`** otherwise — embedded Postgres 16 (WASM), filesystem-persisted

Both expose `query` + `transaction`, so application code is backend-agnostic and
migrating to real Postgres is a one-line env change. Real SQL semantics hold
throughout: CHECK constraints, FK cascades, partial unique indexes, views,
`jsonb`.

The singleton lives on `globalThis` — Next compiles pages and route handlers
into separate module registries, and a module-scoped singleton opens two PGlite
instances on one data dir, which aborts intermittently.

---

## Features

**Attendance** — subject-wise and overall, per-day status log, condonation,
threshold breach flags, classes-to-clear, exam-eligibility gate.

**Leave** — projection before applying, multi-step approval, state machine that
refuses re-decisions, full audit trail (`leave_events`), parent notification.

**Marks & CGPA** — internal/external split, grade scale, semester progression,
cumulative CGPA, and a **reconciliation** check that recomputes SGPA from live
marks and reports divergence against the published record instead of silently
overwriting it.

**Auth** — signed HttpOnly cookie sessions; role re-read from the DB per request
so a demoted user loses access immediately. No ORM, no NextAuth.

---

## Verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx vitest run` | 12/12 pass (against real in-memory Postgres) |
| `npx next build` | clean, 10 routes |
| `next start` + live HTTP | login, impact, eligibility, marks, leave all 200 |

Test coverage is on behaviour, not just arithmetic: approved leave must not
inflate attendance; condonation moves `effective` but not raw `percentage`; a
longer leave never improves the projection; a settled leave cannot be re-decided;
`held = attended + absent + excused`.

Access control verified live — anonymous → 307 to `/login`; student attempting
to approve a leave → 403; rejection without a reason → 400; re-decision → 409.

---

## Run

```bash
npm install
npm run db:seed     # 48 students, 6 subjects, 11,520 attendance rows
npm run dev         # http://localhost:4000
npm run db:reset    # wipe + reseed
```

Set `DATABASE_URL` to point at a real Postgres. Set `SMTP_URL` / `TWILIO_*` /
`WA_PHONE_NUMBER_ID` to enable outbound channels — absent credentials make a
channel report "not configured" rather than crash, so the same code path runs in
CI.

---

## Limitations

- **Cross-sectional.** One snapshot of attendance; no term-over-term trend, so
  "you are falling" is not yet computable.
- **Period modelling is coarse.** One attendance row per subject per day. A
  timetable with three periods a day would need `period_no` driven by a real
  timetable table.
- **Cadence is inferred from history**, so a newly-joined student has no
  projection basis until a few weeks of classes exist.
- **Faculty marking UI is not built.** The decision API and state machine are
  complete and tested; only the marking/approval screens are missing.
- **Condonation is modelled and applied, but the approval workflow screen is
  missing** — rows must currently be inserted by an admin.
- **No timetable module**, so `period_no` stays constant.