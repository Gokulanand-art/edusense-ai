"""
In-process rate limiter using a sliding-window algorithm.

Optimized for Render deployment (max 2 workers on free tier).
NOTE: This limiter is per-process. In a multi-worker Gunicorn setup,
each worker maintains its own window, so the effective limit is
max_requests * num_workers per IP. This is acceptable for Render's
free tier (2 workers max) as it provides ~2x the limit across all workers.

For very high traffic scenarios (future), consider upgrading to:
- Paid Render tier with load balancer
- Redis-backed limiter (flask-limiter with Redis)
- Dedicated rate limiting service

Current setup is production-ready for typical campus usage.
"""
from collections import defaultdict, deque
from functools import wraps
from threading import Lock
from time import time

from flask import jsonify, request


_REQUEST_LOG: dict[str, deque] = defaultdict(deque)
_RATE_LIMIT_LOCK = Lock()
_CLEANUP_COUNTER = 0
_CLEANUP_EVERY = 500  # Prune stale keys every N requests to prevent unbounded memory growth


def _get_client_identifier() -> str:
    forwarded_for = request.headers.get("X-Forwarded-For", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.remote_addr or "unknown"


def _maybe_cleanup(now: float, window_seconds: int) -> None:
    """Periodically remove keys whose windows have fully expired."""
    global _CLEANUP_COUNTER
    _CLEANUP_COUNTER += 1
    if _CLEANUP_COUNTER % _CLEANUP_EVERY != 0:
        return
    stale_keys = [
        key for key, history in _REQUEST_LOG.items()
        if not history or (now - history[-1]) >= window_seconds
    ]
    for key in stale_keys:
        del _REQUEST_LOG[key]


def rate_limit(max_requests: int, window_seconds: int):
    """Decorator that applies a per-IP sliding-window rate limit."""

    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            now = time()
            client_key = f"{func.__name__}:{_get_client_identifier()}"

            with _RATE_LIMIT_LOCK:
                history = _REQUEST_LOG[client_key]

                # Evict timestamps outside the window
                while history and now - history[0] >= window_seconds:
                    history.popleft()

                if len(history) >= max_requests:
                    retry_after = max(1, int(window_seconds - (now - history[0])))
                    response = jsonify({
                        "error": "Too many requests",
                        "message": "Rate limit exceeded. Please try again shortly.",
                        "retry_after": retry_after,
                    })
                    response.status_code = 429
                    response.headers["Retry-After"] = str(retry_after)
                    response.headers["X-RateLimit-Limit"] = str(max_requests)
                    response.headers["X-RateLimit-Remaining"] = "0"
                    response.headers["X-RateLimit-Reset"] = str(int(now + retry_after))
                    return response

                history.append(now)
                _maybe_cleanup(now, window_seconds)

            return func(*args, **kwargs)

        return wrapper

    return decorator
