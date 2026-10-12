from flask import g, request

from services.institution_service import (
    extract_institution_code_from_host,
    get_default_institution,
    get_institution_by_code,
)


def _get_requested_institution_code():
    header_code = (request.headers.get("X-Institution-Code") or "").strip()
    if header_code:
        return header_code

    query_code = (request.args.get("institution") or "").strip()
    if query_code:
        return query_code

    if request.is_json:
        payload = request.get_json(silent=True) or {}
        payload_code = (payload.get("institution_code") or "").strip()
        if payload_code:
            return payload_code

    return extract_institution_code_from_host(request.host)


def register_tenant_context(app):
    @app.before_request
    def attach_tenant_context():
        code = _get_requested_institution_code()
        institution = get_institution_by_code(code) if code else None

        if institution is None:
            institution = get_default_institution()

        g.institution = institution
        g.institution_id = institution.get("id") if institution else None
        g.institution_code = institution.get("code") if institution else None
