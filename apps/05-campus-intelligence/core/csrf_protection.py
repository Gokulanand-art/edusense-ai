"""
CSRF protection middleware for Smart Campus Intelligence System.

Uses double-submit cookie pattern: CSRF token is both:
  1. Set as an httponly cookie (generated server-side)
  2. Validated against a client-provided value in request header or form data

This protects against Cross-Site Request Forgery while working with SPA-style
cookie-based authentication.
"""

import secrets
from functools import wraps
from flask import request, jsonify, session


CSRF_TOKEN_LENGTH = 32
CSRF_COOKIE_NAME = "X-CSRF-Token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_FORM_FIELD = "_csrf_token"


def generate_csrf_token():
    """Generate a secure random CSRF token."""
    return secrets.token_urlsafe(CSRF_TOKEN_LENGTH)


def get_csrf_token_from_request():
    """Extract CSRF token from request (header, form, or JSON)."""
    # Check custom header first (preferred for API clients)
    token = request.headers.get(CSRF_HEADER_NAME)
    
    # Fall back to form data
    if not token and request.method in ["POST", "PUT", "DELETE", "PATCH"]:
        if request.is_json:
            token = request.get_json().get(CSRF_FORM_FIELD)
        else:
            token = request.form.get(CSRF_FORM_FIELD)
    
    return token


def csrf_protect(f):
    """
    Decorator to enforce CSRF protection on a route.
    
    Protected routes must receive a valid CSRF token in:
      - X-CSRF-Token header, or
      - _csrf_token form field, or
      - _csrf_token JSON field
    
    Usage:
        @app.route('/api/action', methods=['POST'])
        @csrf_protect
        def protected_action():
            ...
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if request.method in ["POST", "PUT", "DELETE", "PATCH"]:
            # Never protect GET, HEAD, OPTIONS
            stored_token = session.get("_csrf_token")
            request_token = get_csrf_token_from_request()
            
            if not stored_token or not request_token:
                return jsonify({"error": "CSRF token missing"}), 403
            
            if not secrets.compare_digest(stored_token, request_token):
                return jsonify({"error": "CSRF token invalid"}), 403
        
        return f(*args, **kwargs)
    
    return decorated_function


def ensure_csrf_token():
    """
    Ensure a CSRF token exists in the session.
    Call this in a before_request hook or before rendering forms.
    """
    if "_csrf_token" not in session:
        session["_csrf_token"] = generate_csrf_token()


def register_csrf_protection(app):
    """
    Register CSRF protection on the Flask app.
    
    Sets up:
      - before_request hook to generate tokens
      - template context processor to make csrf_token available in templates
    """
    
    @app.before_request
    def before_request_csrf():
        ensure_csrf_token()
    
    @app.context_processor
    def inject_csrf_token():
        """Make csrf_token available in all Jinja templates."""
        return {"csrf_token": session.get("_csrf_token", "")}
