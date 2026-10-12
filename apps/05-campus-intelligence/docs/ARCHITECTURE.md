# Architecture — Smart Campus Intelligence System

> Version 2.0 | June 2026

## Overview

Smart Campus Intelligence is a **multi-tenant SaaS platform** built as a production-grade campus management and placement-readiness analytics system. It demonstrates real engineering tradeoffs: shared-schema multi-tenancy, cookie-first security, async background jobs, AI-assisted advising, and a PostgreSQL-native media pipeline.

---

## System Architecture Diagram

```
                        ┌────────────────────────────────┐
                        │     Browser / Mobile Client     │
                        │  Jinja2 Templates + Vanilla JS  │
                        └──────────────┬─────────────────┘
                                       │  HTTPS
                             ┌─────────▼──────────┐
                             │  Render Load Balancer │
                             │  (proxy, TLS termination)│
                             └─────────┬────────────┘
                                       │
                   ┌───────────────────▼────────────────────┐
                   │              Flask Application           │
                   │                                         │
                   │  ProxyFix  ──►  Security Headers        │
                   │  Rate Limiter ──►  Request Context       │
                   │  Tenant Resolver ──►  JWT Middleware     │
                   │                                         │
                   │  ┌──────────────────────────────────┐  │
                   │  │         Flask Blueprints           │  │
                   │  │                                    │  │
                   │  │  auth_bp      student_bp           │  │
                   │  │  faculty_bp   admin_bp             │  │
                   │  │  ai_bp        notice_bp            │  │
                   │  │  company_bp   peer_learning_bp     │  │
                   │  │  media_bp     export_bp   ...      │  │
                   │  └──────────────┬───────────────────┘  │
                   │                 │                        │
                   │  ┌──────────────▼───────────────────┐  │
                   │  │           Service Layer            │  │
                   │  │                                    │  │
                   │  │  student_service    marks_service  │  │
                   │  │  readiness_service  ai_service     │  │
                   │  │  company_matching   audit_service  │  │
                   │  │  media_service      export_service │  │
                   │  │  ...                               │  │
                   │  └──────────────┬───────────────────┘  │
                   └─────────────────┼─────────────────────┘
                                     │
              ┌──────────────────────▼──────────────────────┐
              │        PostgreSQL  (Render Managed)           │
              │                                               │
              │  Connection Pool: ThreadedConnectionPool      │
              │  (psycopg2, minconn=1, maxconn=5–10)         │
              │                                               │
              │  Core Tables: institutions, users, roles,     │
              │    students, departments, subjects            │
              │  Feature Tables: marks, attendance, skills,   │
              │    mock_tests, goals, notifications, notices  │
              │  SaaS Tables: jwt_blacklist, audit_logs,      │
              │    placement_companies, peer_sessions,        │
              │    media_files (blob storage in-DB)           │
              └───────────────────────────────────────────────┘
                                     │
              ┌──────────────────────▼──────────────────────┐
              │              External Services               │
              │                                             │
              │  Google Gemini API  (AI assistant)          │
              │  SMTP / Gmail  (OTP email verification)     │
              └─────────────────────────────────────────────┘
```

---

## Request Lifecycle

```
Request arrives
    │
    ├── ProxyFix: extract real IP from X-Forwarded-For
    │
    ├── Security Headers: CSP, HSTS, X-Frame-Options added
    │
    ├── Request Context: generate request_id (UUID4), log structured entry
    │
    ├── Rate Limiter: sliding-window per-IP; 429 on excess
    │
    ├── Tenant Resolver:
    │     ├── extract institution from subdomain / header / request body
    │     └── set g.institution_id for downstream use
    │
    ├── JWT Middleware (token_required):
    │     ├── read token from HttpOnly cookie (primary) or Authorization header (API clients)
    │     ├── verify signature + expiry
    │     ├── check jwt_blacklist table (revoked tokens)
    │     └── populate g.user, g.user_role, g.institution_id
    │
    ├── Route Handler (Blueprint)
    │     └── delegates to Service Layer
    │
    ├── Service Layer: business logic, DB queries
    │     └── always scoped by institution_id (tenant isolation)
    │
    └── Response: JSON (API) or Jinja2 (page)
```

---

## Multi-Tenancy Model

We use **shared-schema multi-tenancy** — all tenants share one database with `institution_id` columns enforcing data isolation.

```
institutions
│
├── id=1  (Default Campus)
│   ├── users (institution_id=1)
│   ├── students (institution_id=1)
│   ├── departments (institution_id=1)
│   └── ... all feature data scoped to institution_id=1
│
└── id=2  (Acme University)
    ├── users (institution_id=2)
    ├── students (institution_id=2)
    └── ...
```

**Why shared-schema?** For a portfolio/pilot scale, shared-schema gives the speed of monolithic DB ops with logical isolation. The tradeoff vs. database-per-tenant is documented in [ADR-002](ADR/002-multi-tenancy.md).

**Tenant resolution flow:**
1. If authenticated: JWT payload carries `institution_id` — this is the canonical source of truth.
2. For public flows (login, register): institution resolved from `institution_code` in body → `subdomain` header → default institution.

---

## Authentication & Authorization

### Cookie-First JWT Auth

```
Login POST /auth/login
    │
    ├── bcrypt.checkpw (constant-time, prevents timing attacks)
    ├── jwt.encode({user_id, role_id, institution_id, jti, exp})
    │
    ├── Set-Cookie: smart_campus_token=<jwt>
    │     HttpOnly=true  (JS cannot read — prevents XSS token theft)
    │     Secure=true    (HTTPS only in production)
    │     SameSite=Lax   (CSRF protection for cookie)
    │     Path=/
    │     Max-Age=86400
    │
    └── JSON body: {user: {name, email, role_name, dashboard_path}}
             (display metadata only — token NOT in body/localStorage)
```

### RBAC Matrix

| Role        | Capabilities |
|-------------|-------------|
| **Student** | Own dashboard, progress, skills, goals, company matching, AI advisor, media upload |
| **Faculty** | Class analytics, at-risk watchlist, intervention logging, classroom marks/attendance |
| **Admin**   | User management, CSV import/export, audit logs, async reports, institution settings |
| **Super Admin** | Multi-institution management, plan upgrades |

### Token Revocation

Tokens are revoked by writing the `jti` (JWT ID) to the `jwt_blacklist` table. Every authenticated request checks this table before proceeding.

---

## Data Architecture

### Migration Strategy

14 sequential SQL migrations handle schema evolution:

```
001 — Foundation: departments, students
002 — Auth: roles, users, jwt_blacklist
003 — Schema hardening: constraints, indexes
004 — Auth hardening: blacklist, OTP
005 — Wellbeing: wellbeing_entries
006 — Performance indexes
007 — AI: conversation history
008 — Placement companies
009 — Peer learning: sessions, participants
010 — SaaS: institutions, institution_id columns
011 — Notice lifecycle
012 — Enterprise portfolio hardening
013 — Media: file uploads
014 — Media: PostgreSQL blob storage (Render-safe)
```

Migrations run at app startup via `run_migrations()` with idempotent `IF NOT EXISTS` guards — safe to re-run.

### Readiness Score Formula

```
final_score = (attendance × 0.30) + (marks × 0.40) + (skills × 0.20) + (mock_tests × 0.10)

Bands:
  ≥ 80  →  Placement Ready  (green)
  ≥ 60  →  Moderate         (yellow)
  < 60  →  Needs Improvement (red)
```

### Media Storage

Files are stored as `BYTEA` blobs in PostgreSQL (`media_files` table), not on the local filesystem. This is intentional for Render compatibility — Render's free tier uses an ephemeral filesystem that is wiped on every deploy.

---

## Component Details

### Rate Limiter (`core/rate_limiter.py`)

Sliding-window, per-IP, per-route. In-process (no Redis required). Effective limit on Render free tier is `max_requests × num_workers` since each Gunicorn worker has its own window.

```python
@rate_limit(max_requests=10, window_seconds=60)
@auth_bp.route("/auth/login", methods=["POST"])
def login():
    ...
```

### Audit Logger (`services/audit_service.py`)

Writes to `audit_logs` table for sensitive actions: login, password change, user creation/deletion, CSV imports.

```sql
audit_logs (
    id, action, actor_user_id, target_resource,
    details JSONB, institution_id, created_at
)
```

### Feature Flags (`core/feature_flags.py`)

Plan-gated features (AI, peer learning) are toggled at the institution level. AI calls gracefully fall back to a "feature not available" response when `GEMINI_API_KEY` is absent or plan does not include AI.

---

## Deployment Architecture (Render)

```
GitHub → Push to main
    │
    └─► Render Blueprint (render.yaml)
            │
            ├── Web Service: gunicorn wsgi:application
            │     workers=2, threads=2, timeout=120
            │     health check: /health/ready (every 10s)
            │     auto-deploy: true
            │
            └── PostgreSQL: Render Managed (free tier)
                  SSL: require
                  Connection string → DATABASE_URL env var
```

### Health Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /health/live` | Liveness — app process is up |
| `GET /health/ready` | Readiness — DB connected, bootstrap done |
| `GET /health/startup` | Startup — migration ran, tables ready |

---

## Engineering Tradeoffs & Decisions

See [ADR/](ADR/) for full Architecture Decision Records.

| Decision | Choice | Key Reason |
|----------|--------|------------|
| Auth storage | HttpOnly cookie | XSS-safe; no JS token exposure |
| Multi-tenancy | Shared schema | Portfolio scale; faster ops |
| Background jobs | In-process simulation | No Redis/Celery dependency on free Render |
| Media storage | PostgreSQL BYTEA | Render ephemeral disk workaround |
| Rate limiting | In-process sliding window | No Redis required |
| AI provider | Google Gemini | Free tier API; graceful fallback |
| ORM | Raw psycopg2 + pool | Full SQL control; no ORM magic |
| Migrations | Custom SQL runner | Simple, no Alembic dependency |

---

## Local Development Setup

```bash
# 1. Clone and set up environment
git clone https://github.com/your-username/smart-campus-intelligence-system
cd smart-campus-intelligence-system
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 2. Configure
cp .env.example .env
# Edit .env — set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET, SECRET_KEY

# 3. Start (migrations run automatically at startup)
python app.py

# 4. Seed demo data
python scripts/seed_data.py

# 5. Run tests
pytest -q
```

---

## Future Architecture Direction

| Area | Current | Next Step |
|------|---------|-----------|
| Background jobs | In-process simulation | Celery + Redis on paid Render |
| Object storage | PostgreSQL BYTEA | AWS S3 or Cloudflare R2 |
| Multi-tenancy | Shared schema | Row-level security (PostgreSQL RLS) |
| Auth | JWT + cookie | Add OAuth2 / SSO (Google Workspace) |
| Observability | Structured logs + health checks | OpenTelemetry + Grafana |
| Testing | 85 unit/integration tests | Add Playwright E2E tests |
