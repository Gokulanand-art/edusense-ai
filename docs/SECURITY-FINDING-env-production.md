# Security Finding — Tracked Environment File (P0 record, no remediation by M2)

**File:** `apps/03-rag-college-chatbot/.env.production`
**Status:** Tracked in git since import commit `aae7642`. Treat credentials
as potentially compromised until authorized owner verifies.
**M2 action:** Document + escalate only. No remediation performed by M2.

## Evidence (safe, no values)

- `git ls-files` shows `apps/03-rag-college-chatbot/.env.production` tracked.
- `git log --all --full-history -- apps/03-rag-college-chatbot/.env.production`
  returns the import commit. History contains the file.
- Read-only review found live-looking database connection credentials and
  authentication secrets. Values are intentionally not reproduced here.
- Root `.gitignore` before this plan contained `.env` only, not `.env.*`,
  so `.env.production` was not ignored. This plan adds `.env.*` +
  `!.env.example` for future protection only.

## Exposure / rotation

- Exposure: confirmed tracked; real-vs-placeholder status: pending owner verification.
- Rotation status: pending — owned by security/app owner, not M2.
- Do not delay rotation while debating history cleanup.

## Required owner approval

- Owner of `apps/03-rag-college-chatbot` + repository/security owner must:
  1. Verify which credentials are real (privately, no values in issues/chat).
  2. Revoke/rotate real credentials immediately.
  3. Replace tracked file with safe `.env.example` placeholders.
  4. Decide on history cleanup (`git filter-repo`/BFG + force-update),
     coordinating forks/clones and re-clone instructions.
  5. Enable/verify secret scanning + push protection; record actual status.

## Escalation

- Notify privately within 24 hours of identification with path, evidence
  locations, and discovery time. Never include values.
- M2 tracks owner/status here without modifying the affected app.
