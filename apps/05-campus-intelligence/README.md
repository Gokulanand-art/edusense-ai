<div align="center">

# Smart Campus Intelligence System

**Production-grade multi-tenant SaaS for campus placement analytics, student success tracking, and AI-assisted advising.**

[![Python 3.11+](https://img.shields.io/badge/Python-3.11%2B-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![Flask 3.1](https://img.shields.io/badge/Flask-3.1-000?style=flat-square&logo=flask)](https://flask.palletsprojects.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Tests](https://img.shields.io/badge/tests-85%20passing-2EA44F?style=flat-square&logo=pytest)](tests/)
[![CI](https://img.shields.io/github/actions/workflow/status/your-username/smart-campus-intelligence-system/ci.yml?style=flat-square&label=CI&logo=github)](.github/workflows/ci.yml)
[![Deploy on Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat-square&logo=render)](render.yaml)

</div>

---

## What This Is

A closed-loop placement intelligence platform built for campus placement cells. Not a CRUD portal — a system where every data point feeds back into actionable intelligence:

- **Data flows in** → Admin imports marks/attendance via CSV; Faculty records class data; Students log skills and mock tests
- **Intelligence is generated** → Readiness score, company eligibility, per-company skill gap analysis, at-risk detection, AI advisor
- **Outcomes are tracked** → Admin records actual placements (who, where, what package)
- **Analytics close the loop** → Dept-wise placement rates, monthly trend, package distribution, leaderboard

> Built as a portfolio project for product-based company interviews — every architectural tradeoff is documented.

---

## Architecture

```
Browser  (Jinja2 + Vanilla JS)
    │  HTTPS
    ▼
Render Load Balancer
    │
    ▼
Flask Application
├── ProxyFix → Security Headers → Rate Limiter
├── Tenant Resolver  (institution_id from JWT / subdomain)
├── JWT Middleware   (HttpOnly cookie → blacklist check → RBAC)
└── 20 Blueprints
    │
    ▼
Service Layer  (always institution-scoped)
    │
    ▼
PostgreSQL (Render Managed)
├── 16 idempotent migrations
├── psycopg2 ThreadedConnectionPool
└── Media as BYTEA blobs  (no ephemeral-disk dependency)
```

Full diagrams, request lifecycle, RBAC matrix: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

---

## Data Flow by Role

### Student — What goes in / what comes back

| Input | Powers |
|-------|--------|
| Skills (self-reported) | Readiness score (20%), company matching, skill gap page |
| Mock test scores | Readiness score (10%), company eligibility |
| Goals + milestones | Goal tracker, AI advisor context |
| Media uploads (resume, certs) | PostgreSQL vault, downloadable links |

| Output | Source |
|--------|--------|
| **Placement readiness score** | `attendance×0.30 + marks×0.40 + skills×0.20 + mock×0.10` |
| **Company eligibility list** | Match engine vs. live company minimums |
| **Skill gap analysis** | Per-company: exact marks/attendance/skills delta + action plan |
| **Leaderboard rank** | Top students ranked by readiness (privacy: first name + last initial) |
| **AI Advisor** | Gemini, injected with student's actual score data |
| **Placement outcomes** | Their own offers recorded by admin |

### Faculty — What goes in / what comes back

| Input | Powers |
|-------|--------|
| **Bulk marks entry** (new) | Readiness score (40%), at-risk detection — whole class at once |
| Attendance per student | Readiness score (30%), dropout risk |
| Intervention notes | Audit trail, admin visibility |

| Output | Source |
|--------|--------|
| Class analytics | Dept-wide attendance + marks distribution |
| At-risk watchlist | Students below 60% readiness, sortable by risk |
| AI class insights | Gemini, with class-level aggregate data |
| Per-student detail | Full readiness breakdown on click |

### Admin — What goes in / what comes back

| Input | Powers |
|-------|--------|
| CSV bulk import (students, marks, attendance) | All downstream analytics |
| **Placement outcomes** (company, package, student) | Placement statistics dashboard |
| **Drive records** (campus visit events) | Company visit history |
| User/dept/subject management | Institution structure |

| Output | Source |
|--------|--------|
| Institution KPI summary | Aggregated readiness CTE |
| **Placement statistics dashboard** | Rate, avg/max/median package, dept breakdown, monthly trend |
| **Leaderboard** (full names) | Top students by readiness |
| Audit trail | Tamper-evident log of every sensitive action |
| CSV / Excel / PDF exports | Tenant-scoped bulk download |
| Async report jobs | Long-running exports via background job simulation |

---

## Feature Map

| Feature | Student | Faculty | Admin |
|---------|:-------:|:-------:|:-----:|
| Placement readiness score | ✅ own | ✅ class | ✅ all |
| Company matching | ✅ | — | — |
| **Skill gap analysis** | ✅ | — | — |
| **Leaderboard** | ✅ (anonymised) | ✅ | ✅ (full) |
| AI advisor | ✅ | ✅ class | — |
| Goals + milestones | ✅ | — | — |
| Skill portfolio | ✅ | — | — |
| Peer learning feed | ✅ | — | — |
| Media vault | ✅ | — | — |
| **Bulk marks entry** | — | ✅ | — |
| Class analytics | — | ✅ | — |
| At-risk watchlist | — | ✅ | ✅ |
| Intervention log | — | ✅ record | ✅ view |
| User management | — | — | ✅ |
| CSV import / export | — | — | ✅ |
| **Placement outcomes** | view own | — | ✅ record |
| **Placement analytics** | — | — | ✅ |
| Notice board | view | — | ✅ |
| Audit trail | — | — | ✅ |
| Health endpoints | — | — | ✅ |

---

## Engineering Highlights

| Area | What was built |
|------|----------------|
| **Security** | HttpOnly cookie JWT (JS can never read token — XSS-safe), bcrypt timing-safe login, token blacklist table, OTP reset, rate limiting, CSP + HSTS + X-Frame-Options |
| **Multi-tenancy** | Shared-schema: `institution_id` on every table, JWT-carried tenant, service-layer scoping, regression-tested for cross-tenant leakage |
| **Readiness Engine** | `final_score = att×0.30 + marks×0.40 + skills×0.20 + mock×0.10` — SQL CTE per request |
| **Company Matching** | Per-company criterion gap: marks/attendance/mock/skills vs. minimums, weighted match score, three eligibility tiers (ready / near-miss / stretch) |
| **Skill Gap Analysis** | Student-facing page: fill bars, exact delta per criterion, auto-generated action plan prose |
| **Placement Statistics** | Placement rate, avg/max/median package, dept-wise breakdown, monthly trend chart, package distribution bands, company rankings |
| **Bulk Marks Entry** | Faculty enters marks for entire class in one table → manual upsert (UPDATE → INSERT if missing) — no unique-constraint dependency |
| **Leaderboard** | Student-visible (anonymised) + admin-visible (full names), filterable by dept, calling student's rank highlighted |
| **Data pipeline** | 16 idempotent SQL migrations, psycopg2 ThreadedConnectionPool, 30+ composite indexes |
| **AI** | Gemini API, lazy-init, graceful fallback when key absent, student/faculty-specific system prompts |
| **Observability** | `/health/live`, `/health/ready`, `/health/startup`, structured request logging with UUIDs, tamper-evident audit log |
| **Testing** | 85 tests: auth, tenant isolation, readiness formula, company matching, AI fallback, health, media, SaaS hardening |
| **CI** | GitHub Actions: Ruff lint → pytest (3.11 + 3.12 matrix) → Bandit security scan → encoding check |

---

## Quick Start (local)

```bash
# 1. Clone
git clone https://github.com/your-username/smart-campus-intelligence-system
cd smart-campus-intelligence-system

# 2. Install
python -m venv venv && source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Configure
cp .env.example .env
# Edit .env: set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, SECRET_KEY

# 4. Run  (migrations execute automatically at startup)
python app.py

# 5. Seed demo data
python scripts/seed_data.py

# 6. Test
pytest -q
```

**Demo credentials** — password `password123` for all:

| Role | Email |
|------|-------|
| Admin | `admin@smartcampus.edu` |
| Faculty | `faculty@smartcampus.edu` |
| Student | `arjun.sharma.0@example.edu` |

---

## Render Deployment (one-click)

```
1. Fork this repo
2. render.com → New → Blueprint → connect your fork
3. Render reads render.yaml and provisions web service + managed PostgreSQL
4. Set GEMINI_API_KEY in the dashboard (optional — enables AI assistant)
5. After first deploy, seed demo data via the Render shell:
      python scripts/seed_data.py
6. Smoke test:
      bash scripts/verify_deployment.sh https://your-app.onrender.com
```

All secrets (`JWT_SECRET`, `SECRET_KEY`) are auto-generated by `render.yaml` on first deploy.

---

## Project Structure

```
smart-campus-intelligence-system/
├── app.py                    # Factory: blueprints, bootstrap, health routes
├── wsgi.py                   # Gunicorn entry
├── config.py                 # Settings dataclass (env-driven, frozen)
├── database.py               # psycopg2 ThreadedConnectionPool
│
├── auth/                     # Login, logout, register, OTP, JWT middleware
├── core/                     # Rate limiter, CSP/HSTS, tenant resolver,
│                             #   feature flags, request logging
│
├── routes/  (20 blueprints)  # Thin handlers — all logic in services
├── services/(26 services)    # Institution-scoped business logic
├── migrations/ (16 files)    # Idempotent SQL — run at startup
│
├── templates/                # Jinja2: login, 3 role dashboards,
│   ├── dashboard_student.html   #   readiness, company matching
│   ├── dashboard_faculty.html
│   ├── dashboard_admin.html
│   ├── placement_dashboard.html # Admin: placement analytics
│   ├── skill_gap.html           # Student: per-company gap analysis
│   ├── leaderboard.html         # All roles: readiness rankings
│   └── faculty_bulk_marks.html  # Faculty: class marks entry
│
├── static/                   # CSS design system + role JS files
│
├── tests/ (14 files)         # 85 pytest tests
├── scripts/
│   ├── seed_data.py          # 55 demo students + accounts
│   └── verify_deployment.sh  # Post-deploy smoke test (9 checks)
├── docs/
│   ├── ARCHITECTURE.md       # Diagrams, request lifecycle, tradeoffs
│   ├── DEMO.md               # Interview demo script + talking points
│   └── ADR/                  # 3 Architecture Decision Records
├── .github/workflows/ci.yml  # Lint → Test (3.11+3.12) → Security scan
└── render.yaml               # One-click Render Blueprint
```

---

## API Reference

```
Auth
  POST   /auth/login                    Cookie-first JWT login
  POST   /auth/logout                   Revoke token
  POST   /auth/register                 Create account
  POST   /auth/forgot-password          OTP reset

Student
  GET    /student/dashboard             Readiness, KPIs, alerts
  GET    /company/matches               Eligible / near / stretch companies
  GET    /skill-gap                     Gap analysis page
  GET    /leaderboard                   Rankings page
  GET    /student/skills                Skill portfolio
  POST   /student/skills                Add skill

Faculty
  GET    /faculty/dashboard             Class analytics, at-risk list
  GET    /faculty/bulk-marks            Bulk marks entry page
  POST   /faculty/marks/bulk            Save class marks (array)
  GET    /faculty/students-for-marks    Students + existing marks for subject

Admin
  GET    /admin/dashboard               Institution overview page
  GET    /admin/dashboard/summary       KPI JSON
  GET    /placement/dashboard           Placement analytics page
  GET    /placement/stats               Full placement stats JSON
  POST   /placement/outcomes            Record student offer
  PATCH  /placement/outcomes/<id>       Update offer status
  GET    /students                      Search students (for forms)
  GET    /admin/exports/students        CSV export
  POST   /admin/imports/students        Bulk import
  GET    /admin/audit-logs              Paginated audit trail

Health
  GET    /health/live                   Liveness probe
  GET    /health/ready                  Readiness probe (DB verified)
  GET    /health/startup                Startup probe (migrations ran)
```

---

## Security Model

| Attack | Mitigation |
|--------|-----------|
| XSS token theft | JWT in HttpOnly cookie — JS cannot read it |
| Token reuse after logout | `jti` written to `jwt_blacklist` on logout |
| User enumeration | bcrypt runs even for unknown users (constant time) |
| Brute-force login | Per-IP rate limiting on `/auth/login` |
| Cross-tenant data leak | `institution_id` from JWT, not request; service-layer enforcement; regression-tested |
| Clickjacking | `X-Frame-Options: DENY` |
| MIME sniffing | `X-Content-Type-Options: nosniff` |
| Cross-site scripting | CSP header; `bleach` sanitisation on write endpoints |

---

## Architecture Decisions

| ADR | Decision | Why |
|-----|----------|-----|
| [001](docs/ADR/001-cookie-first-auth.md) | HttpOnly cookie JWT | XSS cannot steal token |
| [002](docs/ADR/002-multi-tenancy.md) | Shared-schema tenancy | Fits Render free tier; simpler ops |
| [003](docs/ADR/003-postgresql-media-storage.md) | PostgreSQL BYTEA media | Render ephemeral disk workaround |

---

## Resume Bullets

```
• Built a production-style multi-tenant campus SaaS (Flask 3.1, PostgreSQL) with shared-schema
  tenancy, 4-role RBAC (Student/Faculty/Admin/Super-Admin), and HttpOnly cookie-first JWT auth
  that eliminates XSS token-theft. Institution isolation enforced at JWT payload, service layer,
  and regression-tested with cross-tenant leakage tests across 85 automated tests.

• Engineered a closed-loop placement intelligence platform: readiness scoring engine
  (attendance 30% + marks 40% + skills 20% + mock 10%), per-company skill gap analysis with
  exact delta and auto-generated action plans, and a placement outcomes tracker feeding an
  admin analytics dashboard (rate, avg/max package, dept breakdown, monthly trend).

• Shipped production features across all roles — Faculty bulk class marks entry with manual
  upsert; Student anonymised leaderboard with personal rank; Placement statistics dashboard
  with Chart.js visualisations — plus: 16 idempotent migrations, psycopg2 connection pooling,
  rate limiting, CSP/HSTS headers, tamper-evident audit logs, CSV/Excel/PDF exports,
  PostgreSQL blob storage, health check triad, and GitHub Actions CI (lint + test + security).
```

---

## License

MIT — see [LICENSE](LICENSE).
