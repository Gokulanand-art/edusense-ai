# Dependency and Lifecycle Risk (P0 report — no upgrades)

**Status:** Verified findings as of Phase 0. No package changes made.
Lifecycle dates must be rechecked against official Django/Python sources
before publishing as definitive.

## Findings

- **Django 3.2 (`apps/02-timetable-scheduler`, `Django==3.2.25`):**
  Past end of upstream support. Plan upgrade LTS-to-LTS
  (`3.2 → 4.2 → 5.2`) with warnings-on, one LTS live at a time.
  Do not jump multiple LTS in one change. Owned by app owner, not M2.
- **Django 4.2 lifecycle:** Verify current support status against
  djangoproject.com before stating EOL dates in reviews.
- **Unpinned ERP deps (`apps/01-college-erp/requirements.txt`):**
  `asgiref`, `Django`, `djangorestframework`, `djoser`, `pytz`, `sqlparse`
  have no pins. Risk: non-reproducible installs. Fix owned by app owner.
- **Python 3.6 README ref (`apps/02-timetable-scheduler/README.md`):**
  Python 3.6 is past support. Confirm actual runtime and upgrade path
  (3.10+ needed before Django 5.x). No change by M2.
- **Node.js for RAG chatbot (`apps/03-rag-college-chatbot/package.json`):**
  `next 14.2.20` — verify `package.json` engines + official Next/Node
  support matrix; README requires Node 18.17+/20+. No change by M2.
- **Compose default credential (`apps/03-rag-college-chatbot/docker-compose.yml`):**
  Contains a default placeholder DB password. Low severity as placeholder,
  but must be overridden via `env_file`/secrets in any shared compose.
  No real secret reproduced here.
- **Secret scanning / push protection:** Status unknown — record actual
  org/repo settings during review; do not claim enabled.
- **PDFs in ERP app:** `apps/01-college-erp/DBMS report.pdf`,
  `apps/01-college-erp/SE report final.pdf` tracked. Owner decision needed:
  retain in git, move to Git LFS, or link externally.

## Out of scope for M2

No version bumps, no lockfile changes, no runtime upgrades under this plan.
