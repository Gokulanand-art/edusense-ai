# MAANG, SaaS, Resume, and Render Readiness Roadmap

Last reviewed: 2026-05-19

## Executive Summary

The project is already a strong portfolio-grade Flask/PostgreSQL SaaS prototype. It has real separation between routes and services, multi-tenant data scoping, JWT auth, migrations, role-based dashboards, AI-assisted workflows, health checks, Render config, and 81 passing tests.

To make it MAANG-interview ready and SaaS-demo ready, the next step is not adding random screens. The next step is turning the app into a polished product story: clear user journeys, production-grade tenant operations, safer auth/storage, better observability, stronger test/CI gates, and a UI that feels intentional under real data.

## Current Strengths

- Multi-role product: Student, Faculty, Admin, and Super Admin concepts exist.
- Multi-tenant foundation: `institutions`, `institution_id`, tenant-aware auth payloads, and tenant isolation tests exist.
- Production primitives: migrations, connection pooling, health endpoints, structured logging, request context, secure headers, rate limiting, audit logs, and Render Blueprint.
- Portfolio features: placement readiness, company matching, interventions, goals, notifications, notice board, resources, peer learning, wellbeing, AI assistant, imports/exports, and async report jobs.
- Test baseline: 81 tests currently pass.

## Current Gaps That Hurt Readiness

These are the highest-signal issues an interviewer or SaaS evaluator will notice.

| Area | Gap | Why It Matters | Priority |
| --- | --- | --- | --- |
| Product polish | Some UI and docs contain mojibake text from corrupted dash, ellipsis, and bullet characters | Looks unprofessional in a live demo | P0 |
| Documentation | README and some docs still mention older test counts and previous roadmap state | Resume projects need clean, current evidence | P0 |
| File storage | Uploads use local filesystem under `uploads` | Render filesystem is ephemeral by default; files can disappear after deploy | P0 |
| Auth frontend | Token is stored in `localStorage` in several JS files | Higher XSS blast radius than HttpOnly cookie-only auth | P0 |
| Background jobs | Report jobs are in-memory | Jobs disappear on restart and do not scale across workers | P1 |
| Migrations | Migrations run during app startup | Fine for prototype; paid Render supports pre-deploy commands better for production | P1 |
| UX depth | Dashboards show metrics, but workflows are still shallow in places | SaaS products win on task completion, not metric cards | P1 |
| API consistency | Response shapes vary by route | Harder to document, test, and consume | P1 |
| Observability | Health exists, but no metrics dashboard or trace-level visibility | MAANG-style systems need measurable reliability | P1 |
| Test quality | Good unit coverage, but limited browser/E2E/accessibility/security gates | Portfolio needs confidence beyond endpoint tests | P1 |

## Readiness Scorecard

| Dimension | Current | Target | Notes |
| --- | --- | --- | --- |
| Backend architecture | 7.5/10 | 9/10 | Good service split; needs repositories/unit boundaries and API contracts |
| SaaS maturity | 6.5/10 | 9/10 | Tenant scoping exists; needs onboarding, billing, quotas, SSO, lifecycle controls |
| UI/UX polish | 6/10 | 8.5/10 | Useful dashboards; needs end-to-end workflows, responsive audit, empty states, copy cleanup |
| Security | 7/10 | 9/10 | Good basics; needs cookie-first auth, RBAC matrix, CSRF story, scanning, secrets policy |
| Data platform | 7/10 | 9/10 | Postgres and migrations exist; needs backups, seed/reset strategy, migration ops, object storage |
| Render deployment | 7/10 | 9/10 | Blueprint is good; needs storage fix, env checklist, pre-deploy strategy, deploy verification |
| Resume story | 8/10 | 9.5/10 | Already strong; needs clean demo path, screenshots, architecture decision records, metrics |

## P0 Before Public Demo

1. Fix text encoding across templates, docs, comments, and requirements.
   - Replace mojibake artifacts from corrupted dash, ellipsis, bullet, and box-drawing characters.
   - Add a small script or CI check that fails on common mojibake sequences.
   - Demo impact: instantly more professional.

2. Update project truth.
   - README badge and baseline should say `81 passing`, not `78`.
   - Align `START_HERE.md`, executive docs, deployment docs, and README.
   - Add a one-page "Demo Script" with login credentials, flows, and expected screenshots.

3. Make uploads Render-safe.
   - Do not rely on local `uploads` for user files in production.
   - Use S3-compatible object storage, Cloudinary, Supabase Storage, or Render persistent disk only if zero-downtime tradeoffs are accepted.
   - Keep DB metadata in Postgres.
   - Add tests around file ownership and deletion.

4. Harden browser auth.
   - Move the primary auth path to HttpOnly secure cookie.
   - Reduce or remove token reliance in `localStorage`.
   - Add CSRF protection for cookie-authenticated mutations.
   - Keep Bearer token support only for API clients if needed.

5. Add deploy verification checklist.
   - Health: `/health/live`, `/health/ready`, `/health/startup`.
   - Smoke: login, admin dashboard, student dashboard, faculty dashboard, import/export, AI fallback.
   - DB: migrations applied, seed script optional, connection pool under configured max.

## Student Side Roadmap

### P0: Make Existing Student Experience Demo-Ready

- Personalized landing state after login.
  - Show "today's priorities": attendance risk, pending goals, unread notices, next recommended action.
  - Use one primary CTA instead of several equal metric cards.

- Explainable readiness score.
  - Show how marks, attendance, mock tests, skills, goals, and company fit contribute.
  - Add "what changed since last week" so the score feels alive.

- Profile completion checklist.
  - Academic profile complete.
  - Skills added.
  - Resume uploaded.
  - Mock test attempted.
  - Target companies selected.

- Clean mobile experience.
  - Student pages should be fully usable on phone width.
  - Sticky bottom action area for main CTA.
  - No clipped buttons, tables, or chart labels.

### P1: Placement and Career Features

- Job role readiness tracks.
  - Tracks: Backend Engineer, Frontend Engineer, Data Analyst, ML Engineer, DevOps, QA.
  - Each track maps required skills, subjects, mock scores, projects, and missing gaps.

- Company fit simulator.
  - "What if I improve attendance to 85%?"
  - "What if I add DSA and SQL?"
  - Show predicted change in eligible companies.

- Resume and portfolio builder.
  - Student enters projects, skills, certifications, achievements.
  - Generate a clean PDF resume.
  - Score resume completeness.

- Application tracker.
  - Company, status, round, deadline, notes, interview date, offer result.
  - Connect with notifications and calendar reminders.

- Interview preparation hub.
  - Topic checklist.
  - Mock interview score history.
  - Question bank by role.
  - AI-generated practice plan from weak areas.

- Skill evidence.
  - Link GitHub, LinkedIn, LeetCode, certificates.
  - Faculty/admin can verify selected evidence.

### P2: Differentiating Student Features

- Peer mentor matching based on complementary strengths.
- Learning streaks and badges backed by actual activity.
- Student data export and privacy center.
- Scholarship/eligibility advisor.
- "Ask alumni" or alumni mentor workflow.

## Faculty Side Roadmap

### P0: Make Faculty Workflows Real

- Faculty ownership model.
  - Assign faculty to departments, subjects, sections, or cohorts.
  - Faculty dashboards should show "my students", not all tenant students by default.

- Actionable at-risk queue.
  - Sort by severity, due date, last contact, and missing intervention.
  - Add bulk actions: assign intervention, send reminder, export watchlist.

- Intervention lifecycle.
  - Statuses: open, in progress, waiting on student, resolved, escalated.
  - Notes timeline.
  - Follow-up due date.
  - Outcome tracking.

- Grade and attendance entry ergonomics.
  - Spreadsheet-like inline editing.
  - Bulk CSV upload.
  - Validation and preview before save.
  - Undo or correction history.

### P1: Faculty Intelligence

- Class analytics dashboard.
  - Attendance distribution.
  - Subject-wise weak topics.
  - Students trending down.
  - Students improving.
  - Intervention effectiveness.

- Faculty AI copilot.
  - Generate briefing for a student before counseling.
  - Draft intervention notes.
  - Summarize class risks.
  - Must show source metrics and keep faculty as final decision maker.

- Resource effectiveness.
  - Which resources are viewed.
  - Which weak students consumed which resources.
  - Recommended resources for each risk cluster.

- Office hours workflow.
  - Faculty availability.
  - Student booking.
  - Follow-up notes.

### P2: Faculty Differentiators

- Rubric-based assessment.
- Cohort comparison across terms.
- Parent/guardian communication templates, if appropriate for the institution.
- Course outcome attainment mapping.

## Admin Side Roadmap

### P0: Institution Operations

- Tenant onboarding wizard.
  - Create institution.
  - Add departments.
  - Add subjects.
  - Invite admins/faculty.
  - Import students.
  - Verify data quality.

- Data import center.
  - CSV template download.
  - Upload preview.
  - Row-level validation errors.
  - Duplicate detection.
  - Import history and rollback.

- User management upgrade.
  - Invite user by email.
  - Reset password.
  - Disable account.
  - Change role.
  - Assign faculty to subjects/cohorts.
  - Last login and account status.

- Admin system health page.
  - DB status.
  - Migration version.
  - Background job status.
  - Recent errors.
  - Storage status.

### P1: SaaS Admin and Super Admin

- Plan and entitlement management.
  - Starter, Growth, Enterprise.
  - Feature flags visible in UI.
  - Usage limits: users, students, storage, AI calls, exports.

- Billing-ready model.
  - Not necessarily real Stripe on day one.
  - Add tables for subscription, plan, invoices, usage events.
  - Show a billing dashboard stub for portfolio story.

- Audit log depth.
  - Record create/update/delete for users, subjects, students, notices, imports, exports, role changes, settings changes.
  - Add filters by actor, entity, action, date, IP, institution.

- Data quality dashboard.
  - Missing roll numbers.
  - Duplicate emails.
  - Students without user accounts.
  - Faculty without subjects.
  - Subjects without departments.

### P2: Enterprise Admin

- SSO/OIDC/SAML institution login.
- Custom branding per institution.
- Domain/subdomain mapping.
- Compliance export bundle.
- Data retention policy controls.
- Tenant suspension/reactivation.

## UI/UX Roadmap

### Information Architecture

- Replace "dashboard as everything" with role-specific workflows.
  - Student: Today, Progress, Career, Goals, Resources, Notifications.
  - Faculty: Overview, Classroom, Interventions, Students, Resources, Notices.
  - Admin: Overview, Users, Academics, Imports, Reports, Audit, Settings, Institutions.

- Make navigation stable across pages.
  - Current sidebar labels should map to actual full pages or clear anchors.
  - Avoid hidden sections that feel like separate products in one scroll.

### Interaction Quality

- Add real loading, empty, error, and success states everywhere.
- Replace browser `confirm()` prompts with consistent modals for destructive actions.
- Add inline validation, not only API error toasts.
- Make tables searchable, sortable, paginated, and responsive.
- Add saved filters for faculty/admin power users.

### Visual Design

- Fix text encoding before any visual polish.
- Reduce duplicated CSS across `style.css`, `dashboard-modern.css`, `fixes.css`, and component CSS.
- Build a small design token system:
  - color roles
  - spacing scale
  - typography scale
  - status colors
  - card/table/form/button patterns
- Avoid card overload on operational admin pages.
- Prefer dense, scannable layouts for admin/faculty.

### Accessibility

- WCAG AA color contrast check.
- Keyboard navigation for menus, forms, tables, and modals.
- Visible focus states.
- Labels for every input.
- ARIA live region for toasts and async updates.
- Reduced motion support.

## System Architecture Roadmap

### P0/P1 Backend Improvements

- API contract consistency.
  - Standard envelope for success and errors.
  - Version APIs under `/api/v1`.
  - Add OpenAPI spec generation or a maintained `openapi.yaml`.

- Repository/data access layer.
  - Keep services focused on business logic.
  - Move SQL into repository modules for testability.

- Migration operations.
  - Keep startup migrations for free-tier demo if needed.
  - For paid Render production, move migrations to a pre-deploy command or release phase equivalent.
  - Add migration status endpoint visible only to admins.

- Background jobs.
  - Replace in-memory report jobs with a persistent `report_jobs` table first.
  - Later add Redis/RQ/Celery or Render background worker.
  - Ensure idempotency and retry states.

- File storage abstraction.
  - `StorageService` interface.
  - Local storage for dev.
  - Object storage provider for production.
  - Signed download URLs.

- Observability.
  - Request latency logging.
  - Error correlation by request ID.
  - DB pool metrics.
  - Slow query logging.
  - Admin-only operations dashboard.

### Security Improvements

- Cookie-first auth with CSRF protection.
- Fine-grained RBAC permissions, not only role names.
- Password policy and breach-password checks.
- Account lockout and login anomaly logging.
- Audit all sensitive mutations.
- Security scanning in CI:
  - dependency audit
  - secret scan
  - static analysis
  - basic OWASP checks

### Data Model Improvements

- Add sections/batches/semesters.
- Add faculty-subject assignments.
- Add enrollment table between students and subjects.
- Add academic term table.
- Add company application table with student status history.
- Add usage event table for SaaS metering.
- Add notification delivery status.

## AI Roadmap

### Guardrails First

- AI outputs should cite the dashboard metrics they used.
- Add "AI can be wrong" microcopy in assistant UI.
- Store AI conversations with retention controls.
- Add plan-level AI usage limits.
- Add faculty/admin visibility into AI usage if institution policy allows.

### Student AI

- Personalized weekly career plan.
- Interview question generator based on role track.
- Resume bullet coach.
- Skill gap explainer.
- Company match reasoning.

### Faculty AI

- Student counseling brief.
- Intervention draft.
- Class risk cluster summary.
- Suggested resources for weak topics.

### Admin AI

- Institution health summary.
- Data quality anomaly detection.
- Cohort trend explanation.
- Import error summarizer.

## Testing and Quality Roadmap

### P0/P1

- Add coverage reporting with a target threshold.
- Add Playwright smoke tests:
  - login
  - student dashboard loads
  - faculty dashboard loads
  - admin dashboard loads
  - create notice
  - import preview
- Add accessibility tests for critical pages.
- Add migration tests from empty DB.
- Add Render-like startup test with production env vars.
- Add tests for file ownership and tenant isolation in media routes.
- Add tests for admin import edge cases.

### CI/CD

- Update GitHub Actions to Python version matching `.python-version`.
- Add dependency cache.
- Add lint/format checks.
- Add security checks.
- Add coverage artifact.
- Add deploy smoke checklist or script.

## Render Deployment Roadmap

Current `render.yaml` is a good start:

- Uses Python web service.
- Installs `requirements.txt`.
- Starts with Gunicorn through `wsgi:application`.
- Uses `/health/ready`.
- Provisions Render Postgres.
- Uses SSL mode and production cookie settings.

Recommended improvements:

1. Confirm Python version.
   - The repo has `.python-version`.
   - Render also supports setting `PYTHON_VERSION` as an environment variable.
   - Keep runtime consistent with local and CI.

2. Keep health checks meaningful.
   - Render HTTP health checks should return `2xx` or `3xx` when healthy.
   - `/health/ready` already verifies DB connectivity, which matches Render guidance for operation-critical checks.

3. Fix storage before upload demo.
   - Render services use an ephemeral filesystem by default.
   - Local writes under `uploads` are not durable across deploys.
   - Prefer object storage for uploaded media.

4. Decide migration strategy.
   - Free-tier friendly: startup migrations with strict validation.
   - More production-like: paid service pre-deploy command for migrations.

5. Add Render deploy smoke script.
   - Check `/health/ready`.
   - Login with seeded admin.
   - Fetch admin context.
   - Fetch student dashboard.
   - Fetch faculty summary.

6. Add graceful shutdown awareness.
   - Render sends shutdown signals during deploy.
   - Ensure DB pool closes cleanly and background jobs do not corrupt state.

Sources:

- Render Flask quickstart: https://render.com/docs/deploy-flask
- Render health checks: https://render.com/docs/health-checks
- Render Python version: https://render.com/docs/python-version
- Render deploy behavior and ephemeral filesystem: https://render.com/docs/deploys

## Resume and MAANG Interview Story

The final story should not be "I built a college dashboard." It should be:

> I built a multi-tenant student success SaaS platform with role-based workflows, placement-readiness analytics, AI-assisted advising, tenant isolation, audit logging, health checks, CI, and Render deployment.

Best resume bullets after roadmap execution:

- Built a multi-tenant Flask/PostgreSQL SaaS platform with tenant-scoped JWT auth, role-based dashboards, audit logging, and Render deployment.
- Designed explainable placement-readiness analytics using attendance, marks, mock tests, skills, goals, and company eligibility constraints.
- Implemented production controls including migrations, connection pooling, health checks, structured logging, rate limiting, secure headers, and CI regression tests.
- Shipped student, faculty, and admin workflows for intervention management, imports/exports, notifications, company matching, and AI-assisted advising.
- Hardened deployment for Render with DB-backed readiness checks, object storage abstraction, environment-driven configuration, and deployment smoke tests.

## Suggested Build Sequence

### Sprint 1: Demo Trust and Polish

- Fix encoding issues.
- Update README and demo docs.
- Add demo script and screenshots.
- Add Playwright smoke tests.
- Add OpenAPI or endpoint catalog.

### Sprint 2: Student Career Product

- Role readiness tracks.
- Profile completion.
- Company fit simulator.
- Application tracker.
- Resume builder MVP.

### Sprint 3: Faculty Workflow Depth

- Faculty-subject assignments.
- At-risk queue.
- Intervention lifecycle.
- Bulk marks/attendance workflow.
- Faculty AI student brief.

### Sprint 4: Admin SaaS Operations

- Tenant onboarding wizard.
- Import preview and validation.
- User lifecycle management.
- Audit log expansion.
- Data quality dashboard.

### Sprint 5: Production Hardening

- Object storage.
- Cookie-first auth and CSRF.
- Persistent jobs.
- Observability dashboard.
- Security and coverage gates in CI.

### Sprint 6: Render Production Launch

- Final Render env checklist.
- Deploy smoke script.
- Seed/demo mode.
- Backup and restore notes.
- Public demo walkthrough.

## Definition of Ready for Public Portfolio Demo

- `pytest` passes.
- No visible mojibake or broken copy.
- README test count and feature claims are current.
- Demo users and flows are documented.
- Student, faculty, and admin dashboards have reliable empty/loading/error states.
- `/health/ready` is healthy on Render.
- Uploaded files do not depend on ephemeral local storage.
- At least one end-to-end browser smoke test passes.
- Resume bullets match what the deployed app actually demonstrates.
