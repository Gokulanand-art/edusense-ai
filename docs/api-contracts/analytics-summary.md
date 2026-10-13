# Analytics Summary Contract (Proposed, P0 — not implemented)

**Status:** Proposed. Requires owner approval. M2 must not invent scoring
or business semantics owned by M1/M4.

## Endpoint (proposed)

`GET /api/analytics/summary`

## Filters

- Same filter params as `students-list.md` (`band`, `branch`, `tier`, `q`)
  where applicable. Document per-metric applicability table in review.
- Totals computed **after** filters (filtered cohort). If any metric needs
  pre-filter totals, define it explicitly per metric — default is filtered.

## Metrics (to be approved per metric)

| Metric | Definition owner | Aggregation | Empty-data behavior |
|---|---|---|---|
| `totalStudents` | M2 + data owner | count after filters | `0` |
| `avgScore` | M1 (semantics) | TBD — mean/median decision needed | `null` + `unavailable: true` |
| `bandDistribution` | M1 (bands) | counts per band | `{}` with all-zero or empty + note |
| `branchBreakdown` | data owner | counts per branch | same as above |
| `atRiskCount` | M1 (threshold) | count below threshold | `0` |
| `updatedAt` | M2 | max record timestamp or pipeline run time | `null` |

- Each metric row needs an approving owner before P1. Unresolved = TBD.
- Data freshness: response includes `updatedAt` and `stale: boolean` if
  pipeline lag exceeds agreed SLA (SLA TBD).

## Unavailable-data behavior

- Partial failure: HTTP 200 with `data` + `warnings: [{code, message}]`
  (safe messages only), or HTTP 503 with `UNAVAILABLE` — decide in review.
- Never expose DB errors, stack traces, or infra details.

## Example shape (proposed)

```json
{
  "data": {
    "totalStudents": 0,
    "avgScore": null,
    "bandDistribution": {},
    "branchBreakdown": {},
    "atRiskCount": 0,
    "updatedAt": null,
    "stale": false
  },
  "warnings": []
}
```
