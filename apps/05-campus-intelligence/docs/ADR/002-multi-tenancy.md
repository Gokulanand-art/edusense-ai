# ADR-002: Shared-Schema Multi-Tenancy

**Date:** 2026-04
**Status:** Accepted
**Deciders:** Engineering

---

## Context

The system serves multiple educational institutions (tenants). We needed to choose a multi-tenancy model before designing the database schema.

### Options considered

| Model | Description | Pros | Cons |
|-------|-------------|------|------|
| **Database-per-tenant** | Each tenant gets their own PostgreSQL database | Full isolation, simple backup per tenant | Expensive on Render; connection pooling breaks; complex migrations |
| **Schema-per-tenant** | Each tenant gets their own PostgreSQL schema | Good isolation | Migrations must run N times; harder to query across tenants |
| **Shared-schema (chosen)** | All tenants share tables, separated by `institution_id` | Simple ops, single migration, easy analytics | Misconfigured query could leak cross-tenant data |

---

## Decision

**Shared-schema** with `institution_id` FK on every tenant-owned table and strict enforcement at the service layer.

```sql
-- Every tenant-scoped table has:
institution_id INTEGER NOT NULL REFERENCES institutions(id)

-- Uniqueness constraints are always (institution_id, ...) not just (...):
UNIQUE INDEX students_institution_email_unique_idx ON students (institution_id, LOWER(email))
```

### Enforcement layers

1. **JWT payload** — carries `institution_id`; middleware sets `g.institution_id`.
2. **Service layer** — every query includes `WHERE institution_id = %s`.
3. **Tenant isolation tests** — regression tests in `tests/test_tenant_foundation.py` and `tests/test_saas_hardening.py` verify that one tenant cannot read another's data.

---

## Consequences

**Good:**
- Single database → single connection pool → fits Render free tier (25 max connections).
- Single migration runner — one `migrations/` folder, not N folders.
- Easy cross-institution analytics for a future super-admin console.
- Straightforward to reason about in code review.

**Trade-offs:**
- A missing `institution_id` WHERE clause in a query leaks cross-tenant data. Mitigated by code review discipline, service-layer encapsulation, and automated tenant isolation tests.
- Full database-level isolation (separate DBs) would be required for GDPR/SOC-2 compliance at enterprise scale. Documented as the next step when commercial tenants require it.
- Backup restore is per-database, not per-tenant. Per-tenant restore would require row filtering.

---

## Migration Path

If a tenant requires full database isolation:
1. Provision a new Render PostgreSQL instance.
2. Export tenant data (`pg_dump --schema-only` + filtered data dump).
3. Import into tenant-specific DB.
4. Update `DATABASE_URL` routing logic (add tenant resolver to pick connection).
