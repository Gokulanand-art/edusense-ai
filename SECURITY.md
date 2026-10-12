# Security Policy (M2 P0 draft)

**Scope:** EduSense-AI monorepo, `feat/m2-api-integration-p0`.
This file documents process only. It does not claim any control is enforced.

## Reporting

- Report suspected credential exposure privately to the repository/security
  owner and the affected app owner. Do not open a public issue with values.
- Include: file path, discovery time, tracked-status evidence
  (`git ls-files`, `git log --all --full-history -- <path>`), exposure
  assessment (confirmed/unknown/pending). Never include credential values
  in notifications, logs, diffs, or chat.

## Demo vs real credentials

- Seed/demo passwords (e.g. documented demo logins) are not production
  secrets but must still not be reused in production.
- Any production database URL, auth secret, API key, or JWT secret found
  in git is treated as potentially compromised until the authorized owner
  verifies otherwise.

## Response

1. Notify within 24 hours of identification. Do not wait for plan approval.
2. Authorized security/app owner verifies which credentials are real and
   owns revocation/rotation immediately.
3. After rotation, authorized owner decides on history cleanup
   (`git filter-repo` / BFG), coordinating forks/clones and force-update.
   M2 does not perform history rewrite or rotation without authorization.
4. Replace tracked secret file with a safe `.env.example` (placeholders only).
5. `.gitignore` prevents future tracking only; it does not untrack or
   erase history.

## Hygiene

- Never commit `.env`, `.env.local`, `.env.production`, `.env.*` with real
  values. Commit only `.env.example` with placeholders.
- Enable GitHub secret scanning + push protection where available;
  document actual status instead of claiming it.
- Use pre-commit secret scanning (e.g. gitleaks) locally.

## History-cleanup decision

- Consider forks, clones, cached pages, and scraper indexing.
- Rotation is mandatory even if history is cleaned.
- Coordinate re-clone instructions if history is rewritten.
