"""
Standardized API response helpers for consistent JSON responses across all endpoints.

All API responses should follow this pattern:
  {
    "status": "success|error",
    "data": {...},           // or null for errors
    "error": "...",          // only on error
    "message": "...",        // optional
    "pagination": {...},     // only for list endpoints
    "meta": {
      "timestamp": "2026-06-05T10:30:00Z",
      "request_id": "uuid",
      "version": "1.0"
    }
  }
"""

from datetime import UTC, datetime
from uuid import uuid4
from flask import request, jsonify


def utc_now():
    """Get current UTC timestamp in ISO 8601 format."""
    return datetime.now(UTC).isoformat()


def generate_request_id():
    """Generate a unique request ID for tracing."""
    return str(uuid4())


def success_response(data=None, message="", status_code=200, pagination=None):
    """
    Build a standardized success response.
    
    Args:
        data: Response payload (dict, list, or None)
        message: Optional success message
        status_code: HTTP status code (200, 201, etc.)
        pagination: Optional pagination info dict
    
    Returns:
        (response_dict, status_code) for Flask
    """
    response = {
        "status": "success",
        "data": data,
        "meta": {
            "timestamp": utc_now(),
            "request_id": generate_request_id(),
        }
    }
    
    if message:
        response["message"] = message
    
    if pagination:
        response["pagination"] = pagination
    
    return jsonify(response), status_code


def error_response(error_msg, status_code=400, details=None, error_code=None):
    """
    Build a standardized error response.
    
    Args:
        error_msg: User-friendly error message
        status_code: HTTP status code (400, 401, 404, 500, etc.)
        details: Optional dict with additional error details
        error_code: Optional application error code
    
    Returns:
        (response_dict, status_code) for Flask
    """
    response = {
        "status": "error",
        "error": error_msg,
        "data": None,
        "meta": {
            "timestamp": utc_now(),
            "request_id": generate_request_id(),
        }
    }
    
    if error_code:
        response["error_code"] = error_code
    
    if details:
        response["details"] = details
    
    return jsonify(response), status_code


def list_response(items, page=1, per_page=20, total=0, **kwargs):
    """
    Build a paginated list response.
    
    Args:
        items: List of items
        page: Current page number
        per_page: Items per page
        total: Total number of items
        **kwargs: Additional fields to include in response
    
    Returns:
        (response_dict, status_code) for Flask
    """
    total_pages = (total + per_page - 1) // per_page if per_page > 0 else 0
    
    pagination = {
        "page": page,
        "per_page": per_page,
        "total": total,
        "total_pages": total_pages,
        "has_next": page < total_pages if total_pages > 0 else False,
        "has_prev": page > 1,
    }
    
    response = {
        "status": "success",
        "data": items,
        "pagination": pagination,
        "meta": {
            "timestamp": utc_now(),
            "request_id": generate_request_id(),
        }
    }
    
    response.update(kwargs)
    
    return jsonify(response), 200


def created_response(data, message="Resource created successfully"):
    """Build a 201 Created response."""
    return success_response(data, message, 201)


def no_content_response():
    """Build a 204 No Content response."""
    return "", 204


def not_found_response(resource_type="Resource"):
    """Build a 404 Not Found response."""
    return error_response(
        f"{resource_type} not found",
        404,
        error_code="NOT_FOUND"
    )


def unauthorized_response(message="Authentication required"):
    """Build a 401 Unauthorized response."""
    return error_response(message, 401, error_code="UNAUTHORIZED")


def forbidden_response(message="Access denied"):
    """Build a 403 Forbidden response."""
    return error_response(message, 403, error_code="FORBIDDEN")


def validation_error_response(errors, message="Validation failed"):
    """
    Build a 400 Bad Request response for validation errors.
    
    Args:
        errors: Dict of field->error_message mappings or list of errors
        message: General validation message
    """
    return error_response(
        message,
        400,
        details={"validation_errors": errors},
        error_code="VALIDATION_ERROR"
    )


def conflict_response(message="Resource already exists"):
    """Build a 409 Conflict response."""
    return error_response(message, 409, error_code="CONFLICT")


def too_many_requests_response(retry_after=None):
    """
    Build a 429 Too Many Requests response.
    
    Args:
        retry_after: Seconds to wait before retrying (optional)
    """
    response, status = error_response(
        "Rate limit exceeded. Please try again later.",
        429,
        error_code="RATE_LIMIT_EXCEEDED"
    )
    
    if retry_after:
        response.headers["Retry-After"] = str(retry_after)
    
    return response, status


def server_error_response(error_msg="Internal server error", error_code=None):
    """Build a 500 Internal Server Error response."""
    return error_response(
        error_msg,
        500,
        error_code=error_code or "INTERNAL_ERROR"
    )
