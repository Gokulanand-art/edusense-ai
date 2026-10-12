# ADR-003: PostgreSQL BYTEA for Media Storage

**Date:** 2026-05
**Status:** Accepted
**Deciders:** Engineering

---

## Context

Users (students) upload files — resumes, certificates, project reports. These need to persist across deployments. Render's free-tier web services use an **ephemeral filesystem**: everything written to local disk is wiped on each deploy or restart.

### Options considered

| Option | Notes |
|--------|-------|
| Local filesystem (uploads/) | Works locally; fails silently on Render free tier |
| Render Persistent Disk | $7/month add-on; not available on free tier |
| S3 / Cloudflare R2 | Best for production; adds `boto3`/`httpx` dependency and AWS account |
| Supabase Storage | Free tier; external dependency |
| **PostgreSQL BYTEA (chosen)** | Zero infrastructure dependencies; files stored in the same DB already provisioned |

---

## Decision

Store file bytes as `BYTEA` in the `media_files` table in PostgreSQL.

```sql
media_files (
    id SERIAL PRIMARY KEY,
    file_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL,
    institution_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    mime_type TEXT,
    size INTEGER,
    file_data BYTEA NOT NULL,   -- the actual bytes
    is_public BOOLEAN DEFAULT FALSE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
)
```

Files are served via `/media/<file_id>` with proper `Content-Type` and `Content-Disposition` headers.

---

## Consequences

**Good:**
- Zero additional services or credentials needed.
- Files survive Render deploys (they're in the managed PostgreSQL, not local disk).
- Auth, ownership, and access control use the same JWT/tenant middleware as everything else.
- Transactional — file + metadata saved atomically.

**Trade-offs:**
- PostgreSQL is not optimized for binary blob serving at high concurrency. Acceptable for a campus app (hundreds of users, not millions).
- Large files (> 10 MB) will bloat the DB. Mitigated by a 50 MB upload limit in Flask config.
- For scale, replace `file_data BYTEA` with `storage_url TEXT` pointing to S3/R2 — a one-migration change with no API surface change.

---

## Migration Path to Object Storage

When the system needs to scale:
1. Provision S3 bucket or Cloudflare R2.
2. Add `storage_url` column to `media_files`.
3. Update `media_service.py` to upload bytes to S3 and store the URL.
4. Update download handler to redirect to signed URL instead of streaming bytes.
5. Backfill existing blobs to S3, set `file_data = NULL`.
