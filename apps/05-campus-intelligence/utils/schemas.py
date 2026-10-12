"""
Reusable schemas and helpers for request validation, response formatting, and pagination.
"""

from datetime import UTC, datetime

import bleach
from marshmallow import Schema, ValidationError, fields, validate


class PaginationQuerySchema(Schema):
    page = fields.Int(load_default=1, validate=validate.Range(min=1))
    per_page = fields.Int(load_default=20, validate=validate.Range(min=1, max=100))
    sort_by = fields.Str(load_default="created_at")
    sort_order = fields.Str(load_default="desc", validate=validate.OneOf(["asc", "desc"]))

    class Meta:  # type: ignore
        ordered = True


class SanitizedString(fields.Str):
    def __init__(self, max_length=None, allowed_tags=None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.max_length = max_length
        self.allowed_tags = allowed_tags or []

    def _deserialize(self, value, attr, data, **kwargs):
        value = super()._deserialize(value, attr, data, **kwargs)
        if not value:
            return value
        sanitized = bleach.clean(value, tags=self.allowed_tags, strip=True)
        if self.max_length:
            sanitized = sanitized[:self.max_length]
        return sanitized.strip()


class SanitizedEmail(fields.Email):
    def _deserialize(self, value, attr, data, **kwargs):
        value = super()._deserialize(value, attr, data, **kwargs)
        return value.lower().strip() if value else value


def utc_timestamp():
    return datetime.now(UTC).isoformat()


class StudentCreateSchema(Schema):
    name = SanitizedString(required=True, max_length=200, validate=validate.Length(min=2, max=200))
    email = SanitizedEmail(required=True)
    department = SanitizedString(required=True, max_length=100, validate=validate.Length(min=2, max=100))
    roll_number = SanitizedString(required=True, max_length=50, validate=validate.Length(min=1, max=50))
    phone = fields.Str(required=False, allow_none=True, validate=validate.Length(max=20))
    date_of_birth = fields.Date(required=False, allow_none=True, format="%Y-%m-%d")

    class Meta:  # type: ignore
        ordered = True


class StudentUpdateSchema(Schema):
    name = SanitizedString(required=False, max_length=200, validate=validate.Length(min=2, max=200))
    email = SanitizedEmail(required=False)
    department = SanitizedString(required=False, max_length=100, validate=validate.Length(min=2, max=100))
    phone = fields.Str(required=False, allow_none=True, validate=validate.Length(max=20))
    date_of_birth = fields.Date(required=False, allow_none=True, format="%Y-%m-%d")

    class Meta:  # type: ignore
        ordered = True


class UserCreateSchema(Schema):
    name = SanitizedString(required=True, max_length=200, validate=validate.Length(min=2, max=200))
    email = SanitizedEmail(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))
    role = fields.Str(required=True, validate=validate.OneOf(["Admin", "Faculty", "Student", "Super_Admin"]))
    phone = fields.Str(required=False, allow_none=True)

    class Meta:  # type: ignore
        ordered = True


class DepartmentCreateSchema(Schema):
    name = SanitizedString(required=True, max_length=100, validate=validate.Length(min=2, max=100))
    code = SanitizedString(required=True, max_length=10, validate=validate.Length(min=1, max=10))
    description = SanitizedString(required=False, allow_none=True, max_length=500)

    class Meta:  # type: ignore
        ordered = True


class SubjectCreateSchema(Schema):
    name = SanitizedString(required=True, max_length=200, validate=validate.Length(min=2, max=200))
    code = SanitizedString(required=True, max_length=20, validate=validate.Length(min=1, max=20))
    department_id = fields.Int(required=False, allow_none=True, validate=validate.Range(min=1))
    credits = fields.Float(required=False, allow_none=True, validate=validate.Range(min=0, max=10))

    class Meta:  # type: ignore
        ordered = True


class MarkEntrySchema(Schema):
    student_id = fields.Int(required=True, validate=validate.Range(min=1))
    subject_id = fields.Int(required=True, validate=validate.Range(min=1))
    marks = fields.Float(required=True, validate=validate.Range(min=0, max=100))
    date = fields.Date(required=False, allow_none=True, format="%Y-%m-%d")

    class Meta:  # type: ignore
        ordered = True


class GoalCreateSchema(Schema):
    title = SanitizedString(required=True, max_length=200, validate=validate.Length(min=3, max=200))
    description = SanitizedString(required=False, allow_none=True, max_length=1000)
    target_date = fields.Date(required=True, format="%Y-%m-%d")
    priority = fields.Str(required=False, allow_none=True, validate=validate.OneOf(["low", "medium", "high"]), load_default="medium")
    status = fields.Str(
        required=False,
        allow_none=True,
        validate=validate.OneOf(["not_started", "in_progress", "completed"]),
        load_default="not_started",
    )

    class Meta:  # type: ignore
        ordered = True


def get_paginated_response_data(data, page, per_page, total):
    total_pages = (total + per_page - 1) // per_page
    return {
        "status": "success",
        "data": data,
        "pagination": {
            "page": page,
            "per_page": per_page,
            "total": total,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
        "meta": {"timestamp": utc_timestamp()},
    }


def validate_request(schema_class, data):
    schema = schema_class()
    try:
        return True, schema.load(data)
    except ValidationError as err:
        return False, err.messages


def create_error_response(code, message, status_code=400, details=None):
    return {
        "status": "error",
        "error": {
            "code": code,
            "message": message,
            "details": details or {},
        },
        "meta": {"timestamp": utc_timestamp()},
    }, status_code
