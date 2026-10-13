# Student Detail Contract (Proposed, P0 — not implemented)

**Status:** Proposed. Requires owner + M1 approval for score semantics.

## Endpoint (proposed)

`GET /api/students/[id]`

## Identifier

- `id` format TBD — confirm against real data model in P1 (UUID vs numeric
  vs admission number). Until confirmed, treat as opaque string.
- Invalid format → 400 `INVALID_ID` (safe message, no DB detail).
- Not found → 404 `NOT_FOUND`.

## Fields (proposed)

| Field | Type | Nullability | Notes |
|---|---|---|---|
| `id` | string | never null | echoed identifier |
| `name` | string | never null | display name; privacy rules TBD |
| `branch` | string | nullable | TBD enum |
| `band` | string | nullable | TBD enum, owned by M1 |
| `tier` | string | nullable | TBD enum |
| `score` | unknown/opaque | nullable | **Do not define shape here.** M1 owns semantics. Expose as opaque object until M1 approves. |
| `updatedAt` | string (ISO-8601) | nullable | record timestamp |
| `missing` | string[] | never null | list of unavailable field keys |

- Fields safe to expose: confirm with privacy/authorization owner.
  Assume auth required; decide role visibility (own vs class vs all) in review.
- Missing data: include key in `missing[]`, set field to `null`, HTTP 200.
  Do not silently drop keys.

## Score rule

Score remains **unknown/opaque** in P0. Any example below is illustrative
only and not a commitment:

```json
{
  "data": {
    "id": "STU-0001",
    "name": "Example Student",
    "branch": null,
    "band": null,
    "tier": null,
    "score": null,
    "updatedAt": null,
    "missing": ["branch", "band", "tier", "score", "updatedAt"]
  }
}
```

## Shared error envelope

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Safe, user-facing explanation",
    "details": {}
  }
}
```

- Stable codes: `INVALID_ID`, `NOT_FOUND`, `INVALID_QUERY`, `INVALID_PAGE`,
  `UNAUTHORIZED`, `FORBIDDEN`, `UNAVAILABLE`, `INTERNAL` (generic only).
- `message` is user-safe. `details` carries only safe validation hints
  (e.g. allowed values), never stack traces, SQL, secrets, or infra data.
