# Students List Contract (Proposed, P0 — not implemented)

**Status:** Proposed. Requires owner approval before P1.
**Format:** Markdown tables for P0. OpenAPI YAML deferred to P1.

## Endpoint (proposed)

`GET /api/students`

## Query parameters

| Param | Type | Required | Default | Allowed | Invalid behavior |
|---|---|---|---|---|---|
| `q` | string | no | `""` | free text, trimmed, max 200 chars | over-limit → 400 `INVALID_QUERY` |
| `band` | string | no | none (all) | TBD — owner to define enum | unknown value → 400 `INVALID_BAND` |
| `branch` | string | no | none (all) | TBD — owner to define enum | unknown value → 400 `INVALID_BRANCH` |
| `tier` | string | no | none (all) | TBD — owner to define enum | unknown value → 400 `INVALID_TIER` |
| `sort` | string | no | `name:asc` | TBD — e.g. `name/score/updated : asc/desc` | unknown key/dir → 400 `INVALID_SORT` |
| `page` | int | no | `1` | `>= 1` | `< 1` or non-int → 400 `INVALID_PAGE` |
| `pageSize` | int | no | `20` | `1–100` | out of range → 400 `INVALID_PAGE_SIZE`, or clamp (decide in review) |

Notes:
- Do not invent `band`/`branch`/`tier` enum values here. Mark TBD for owner review.
- Filtering is AND across provided params. `q` matches name/ID per data-model review.
- Sorting must be stable (secondary key: ID) so pagination is repeatable.

## Response envelope (proposed)

```json
{
  "data": [],
  "page": 1,
  "pageSize": 20,
  "total": 0,
  "totalPages": 0
}
```

- `total` = count after filters, before pagination.
- `totalPages` = `ceil(total / pageSize)`.
- Empty result: `data: []`, `total: 0`, `totalPages: 0`, HTTP 200.
- Out-of-range page: HTTP 200 with `data: []` and correct `total`/`totalPages`
  (alternative 400 — decide in review, document choice).
- `pageSize` limits enforced server-side; response echoes applied values.

## Errors

See shared error envelope in `student-detail.md`. Use `INVALID_*` codes above.
No stack traces, SQL, secrets, or infra details.
