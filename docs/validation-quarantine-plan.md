# Validation and Quarantine Plan (P0 — design only, not implemented)

**Status:** Proposed. Requires owner approval before any implementation.
**Dataset count:** TBD — do not claim 15,000 records until verified by
authorized data inspection. No reconciliation claimed passed.

## Categories

| Category | Meaning | Counted | Example cause |
|---|---|---|---|
| Accepted | valid, usable downstream | yes | passes all checks |
| Rejected | invalid, unusable, dropped | yes | missing required ID, wrong type |
| Quarantined | suspicious, held for review, not in aggregates | yes | out-of-range score, unknown band |

Reconciliation rule:

```text
input = accepted + rejected + quarantined
```

Counts are exposed in import/summary responses and logs. Aggregates
(students-list, analytics-summary) use accepted only unless explicitly
documented otherwise.

## Validation checks (proposed)

- Required fields present, correct types, trimmed strings.
- Enums (`band`, `branch`, `tier`) against owner-approved lists (TBD).
- Ranges (scores, pages) and format (ID, timestamps).
- Duplicates by ID: first wins + warning, or reject duplicates (decide in review).

Invalid input from API callers → 400 with stable `INVALID_*` code.
Invalid source records → counted as rejected/quarantined, never 500 leak.

## Future DataSource sketch (not code)

Inspired by the frozen `Settings` dataclass in
`apps/05-campus-intelligence/config.py` (`_get_env` + immutable config).
Do not import across apps. Future TypeScript shape (illustrative):

```ts
// Proposed only — do not implement in P0
type RecordCounts = { accepted: number; rejected: number; quarantined: number };
interface DataSource {
  listStudents(query: StudentQuery): Promise<PagedResult<Student>>;
  getStudent(id: string): Promise<Student | null>;
  getSummary(filters: SummaryFilters): Promise<Summary>;
  getCounts(): Promise<RecordCounts>;
}
```

- JSON file implements `DataSource` in P1; PostgreSQL replaces it later
  without changing callers.
- Config (paths, DB URL, pool, page-size caps) via immutable settings object
  with `required` + defaults, mirroring the `Settings` pattern.

## Ownership

- Validation rules touching scoring/bands need M1 approval.
- Privacy/role visibility needs authorization owner.
- Implementation needs explicit P1 approval + G0 evidence.
