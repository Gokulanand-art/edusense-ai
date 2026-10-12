"""
Security headers middleware.

Adds industry-standard HTTP security headers to every response so the
app passes OWASP security header checks out of the box.
"""
from flask import Flask, request


def apply_security_headers(app: Flask) -> None:
    """Register an after_request hook that attaches security headers."""

    @app.after_request
    def add_security_headers(response):
        # Prevent MIME-type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Block clickjacking
        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        # Enable XSS filter in older browsers
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Only send the origin as referrer on cross-origin requests
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Remove server fingerprint
        response.headers.pop("Server", None)
        response.headers.pop("X-Powered-By", None)

        # Content Security Policy – allow same-origin resources + common CDNs
        csp = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
            "img-src 'self' data: https:; "
            "connect-src 'self' https://generativelanguage.googleapis.com; "
            "frame-ancestors 'self';"
        )
        response.headers["Content-Security-Policy"] = csp

        # Permissions policy – disable features we don't use
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=()"
        )

        if request.is_secure:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response
