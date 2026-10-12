# ADR-001: Cookie-First JWT Authentication

**Date:** 2026-06
**Status:** Accepted
**Deciders:** Engineering

---

## Context

The initial implementation stored the JWT token in `localStorage` after login and sent it as a `Bearer` header in every request. This pattern is common in tutorials but has a significant security flaw: JavaScript has read access to `localStorage`, which means any XSS vulnerability in the app (a single unescaped `innerHTML`, a malicious CDN script, etc.) can silently exfiltrate the token.

Once a token is stolen, the attacker has full session access until the token expires — regardless of whether the user logs out, because `localStorage` persists across browser sessions.

---

## Decision

Move to **HttpOnly cookie as the primary token transport**.

The server sets the token cookie on login:
```
Set-Cookie: smart_campus_token=<jwt>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400
```

The browser sends this cookie automatically on every same-origin request. JavaScript **cannot read** an HttpOnly cookie — eliminating the XSS token theft attack entirely.

### What stays in sessionStorage
Non-sensitive display metadata only (cleared when tab closes):
- `user_name`, `user_email`, `role_name`, `role_id`

These are used purely for UI rendering (topbar name, role badge). They have no security value — the server re-validates the cookie on every API call.

### Fallback for API clients
The `Authorization: Bearer <token>` header is still accepted for programmatic API clients (e.g., automated scripts, CI tests). The cookie is the primary path for browser sessions.

---

## Consequences

**Good:**
- JWT token is never accessible to JavaScript — eliminates XSS-based token theft.
- `sessionStorage` is cleared when the browser tab closes — reduces session persistence risk.
- Server-side session invalidation (jwt_blacklist) remains the final authority.
- No change to backend auth middleware needed — it already reads from cookie first.

**Trade-offs:**
- Cookie-based auth requires `credentials: "same-origin"` on every `fetch()` call — already handled in `shared.js`.
- CSRF is mitigated by `SameSite=Lax` — cross-origin POST from a different site will not include the cookie. For full CSRF protection, a double-submit token or synchronizer token pattern would be added next.
- Mobile apps or third-party clients must use the `Bearer` header path.
