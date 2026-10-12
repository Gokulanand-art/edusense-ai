import time
import uuid

from flask import g, request

from config import settings


def register_request_context(app):
    @app.before_request
    def attach_request_context():
        g.request_id = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        g.request_started_at = time.perf_counter()

    @app.after_request
    def add_request_headers(response):
        response.headers["X-Request-Id"] = getattr(g, "request_id", "")
        response.headers["X-App-Name"] = settings.app_name
        response.headers["X-Release-Version"] = settings.release_version

        started_at = getattr(g, "request_started_at", None)
        if started_at is not None:
            duration_ms = (time.perf_counter() - started_at) * 1000
            response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"

        return response
