# M2 — Ownership and Boundaries (P0)

**Branch:** `feat/m2-api-integration-p0`
**Base:** `aae7642186e9f7ad82184fbaa96bea8f30aa3495` (`origin/main`)
**Status:** Documentation only. No implementation authorized by this file.

## M2 owns (proposed paths)

- `lib/data.ts` — stable data-access abstraction (JSON now, PostgreSQL later)
- `lib/api.ts` — typed client/helpers for M2 endpoints
- Data validation and pagination utilities (M2-scoped)
- `app/api/students/` — student list (search/filter/sort/paginate)
- `app/api/analytics/summary/` — analytics summary contract
- `app/api/students/[id]/` — student detail including complete score result
- CSV export endpoint — during P3 only

> Note: root-level `/lib` and `/app/api` do not exist in the current
> monorepo layout (verified Phase 0). Paths above are reserved for the
> future M2 surface. Do not create them until P1 is explicitly approved.

## M2 responsibilities (P0)

- Freeze request/response shapes with TypeScript types on paper (Markdown).
- Define student-list query params: `q`, `band`, `branch`, `tier`, `sort`, `page`.
- Define pagination envelope and consistent error envelope.
- Define analytics-summary response contract.
- Define student-detail response with score as opaque until M1 approves.
- Plan validation/quarantine behavior for invalid source records.
- Keep JSON source behind a `DataSource` interface inspired by the frozen
  `Settings` dataclass in `apps/05-campus-intelligence/config.py`.
  Design reference only — no cross-app imports.
- P2 implementation (search/filter/sort/pagination/aggregates) only after
  scoring gate approval.

## M2 must not modify

- `lib/scoring.ts`, `lib/risk.ts`, or M1 scoring formulas and semantics.
- Dashboard pages/components owned by M3.
- Segmentation and explainability logic owned by M4.
- Demo/deployment work owned per project agreement.
- Any other member's app without explicit coordination and approval.

## Review and escalation

- Changes outside M2 scope require the affected owner's approval.
- Unresolved owners/handles are marked `TODO` — never invent a handle.
- Security findings outside M2 scope are documented and escalated;
  remediation is owned by security/app owner.
