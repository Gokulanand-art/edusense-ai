# M2 — Phase Gates (P0)

**Branch:** `feat/m2-api-integration-p0`
**Status:** Definitions only. No gate is passed by writing this file.

## Definitions

- **P0 (this plan):** Documentation, contracts on paper, governance files,
  and illustrative hygiene examples. No routes, migrations, dataset edits,
  installs, or scoring changes.
- **P1:** Implementation of M2 data-access and API surface. Requires
  separate explicit approval after Phase 0 verification + owner review
  of P0 docs.
- **G0:** Entry gate to implementation. Requires: verified base, clean
  tree, approved contracts, resolved CODEOWNERS handles, security finding
  escalated with owner/status recorded.
- **G2:** Validation gate before P2 analytics work. Requires recorded test
  evidence (not assertions). P2 stays blocked until G2 passes.
- **P2:** Search, filtering, sorting, pagination, analytics aggregates.
  Only after scoring gate approval and G2 evidence.

## Rules

- Writing a gate name in a document does not make it pass.
- Gate status must link to evidence: commit SHA, test output, review link,
  or owner decision record.
- Do not claim data reconciliation or release readiness without evidence.
- P0 implementation approval is distinct from plan approval.
- If branch, HEAD, or layout differs from expected, stop and report
  before any edit.

## Current state under this plan

- P0: in review (docs only).
- P1: not started, not approved.
- G0: not passed.
- G2: not passed.
- P2: blocked.
