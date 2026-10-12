import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, Response, jsonify, request

from auth.auth_middleware import token_required, role_required
from services.admin_service import (
    build_admin_export,
    delete_user,
    get_admin_stats,
    get_all_users,
    get_data_quality_snapshot,
    get_operations_snapshot,
    import_students_from_csv,
)
from services.audit_service import list_audit_events, record_audit_event
from services.institution_service import create_institution, get_institution_context, list_institutions
from services.report_job_service import create_report_job, get_report_job
from services.subject_service import create_subject, delete_subject, get_all_subjects
from services.student_service import create_department, delete_department, get_department_catalog
from utils.pagination import PaginationHelper
from utils.schemas import create_error_response

admin_bp = Blueprint("admin_bp", __name__)


@admin_bp.route("/admin/stats", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_stats(current_user):
    try:
        data = get_admin_stats(institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id"))
        return jsonify(data), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/users", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_users(current_user):
    try:
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        # Get all users and apply pagination
        all_users = get_all_users(institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id"))
        
        # Simple list-based pagination (convert to database query pagination in production)
        page = params['page']
        per_page = params['per_page']
        total = len(all_users)
        offset = (page - 1) * per_page
        users = all_users[offset:offset + per_page]
        
        response = PaginationHelper.paginate(users, total, page, per_page)
        return jsonify(response), 200

    except Exception as e:
        logger.exception("fetch_admin_users failed")
        error_resp, status_code = create_error_response("SERVER_ERROR", "An internal error occurred", 500)
        return jsonify(error_resp), status_code


@admin_bp.route("/admin/data-quality", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_data_quality(current_user):
    try:
        return jsonify(
            get_data_quality_snapshot(
                institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id")
            )
        ), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/operations", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_operations(current_user):
    try:
        return jsonify(
            get_operations_snapshot(
                institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id")
            )
        ), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/exports/<string:export_name>", methods=["GET"])
@token_required
@role_required("Admin")
def download_admin_export(current_user, export_name):
    try:
        export_payload = build_admin_export(
            export_name,
            institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id"),
        )
        return Response(
            export_payload["content"],
            mimetype="text/csv; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{export_payload["filename"]}"',
                "Cache-Control": "no-store",
            },
        )

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/imports/students", methods=["POST"])
@token_required
@role_required("Admin")
def import_admin_students(current_user):
    try:
        if "file" in request.files:
            csv_content = request.files["file"].read().decode("utf-8")
        else:
            csv_content = (request.get_json(silent=True) or {}).get("csv", "")

        result = import_students_from_csv(
            csv_content,
            institution_id=current_user.get("institution_id"),
        )
        record_audit_event(
            "students.import_csv",
            actor_user_id=current_user.get("user_id"),
            institution_id=current_user.get("institution_id"),
            entity_type="student",
            metadata={
                "imported_count": result["imported_count"],
                "error_count": result["error_count"],
            },
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify(result), 200 if result["error_count"] == 0 else 207

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/audit-logs", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_audit_logs(current_user):
    try:
        # Get pagination parameters
        params, errors = PaginationHelper.get_pagination_params()
        if errors:
            error_resp, status_code = create_error_response("INVALID_PARAMS", "Invalid pagination parameters", 400, errors)
            return jsonify(error_resp), status_code

        institution_id = None if current_user.get("is_super_admin") else current_user.get("institution_id")
        
        # Get all audit logs
        all_logs = list_audit_events(institution_id=institution_id, limit=1000)
        
        # Apply pagination
        page = params['page']
        per_page = params['per_page']
        total = len(all_logs)
        offset = (page - 1) * per_page
        logs = all_logs[offset:offset + per_page]
        
        response = PaginationHelper.paginate(logs, total, page, per_page)
        return jsonify(response), 200
    except Exception as e:
        logger.exception("fetch_audit_logs failed")
        error_resp, status_code = create_error_response("SERVER_ERROR", "An internal error occurred", 500)
        return jsonify(error_resp), status_code


@admin_bp.route("/admin/reports/jobs", methods=["POST"])
@token_required
@role_required("Admin")
def create_admin_report_job(current_user):
    try:
        data = request.get_json() or {}
        institution_id = None if current_user.get("is_super_admin") else current_user.get("institution_id")
        job = create_report_job(data.get("report_type") or "readiness", institution_id=institution_id)
        record_audit_event(
            "reports.job_created",
            actor_user_id=current_user.get("user_id"),
            institution_id=institution_id,
            entity_type="report_job",
            entity_id=job["id"],
            metadata={"report_type": job["report_type"]},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify(job), 202
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/reports/jobs/<string:job_id>", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_report_job(current_user, job_id):
    job = get_report_job(job_id)
    if not job:
        return jsonify({"error": "Report job not found"}), 404
    if not current_user.get("is_super_admin") and job.get("institution_id") != current_user.get("institution_id"):
        return jsonify({"error": "Report job not found"}), 404
    return jsonify(job), 200


@admin_bp.route("/admin/subject", methods=["POST"])
@token_required
@role_required("Admin")
def create_admin_subject(current_user):
    try:
        data = request.get_json() or {}
        name = (data.get("name") or "").strip()
        code = (data.get("code") or "").strip()
        department = (data.get("department") or "").strip()

        if not name or not code or not department:
            return jsonify({"error": "name, code, and department are required"}), 400

        create_subject(name, code, department, institution_id=current_user.get("institution_id"))
        record_audit_event(
            "subject.created",
            actor_user_id=current_user.get("user_id"),
            institution_id=current_user.get("institution_id"),
            entity_type="subject",
            entity_id=code,
            metadata={"name": name, "department": department},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify({"message": "Subject added successfully"}), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/subjects", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_subjects(current_user):
    try:
        return jsonify(get_all_subjects(institution_id=current_user.get("institution_id"))), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/departments", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_departments(current_user):
    try:
        return jsonify(get_department_catalog(institution_id=current_user.get("institution_id"))), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/department", methods=["POST"])
@token_required
@role_required("Admin")
def create_admin_department(current_user):
    try:
        data = request.get_json() or {}
        department = create_department(data.get("name"), institution_id=current_user.get("institution_id"))
        return jsonify({
            "message": "Department added successfully",
            "department": department,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/department/<int:department_id>", methods=["DELETE"])
@token_required
@role_required("Admin")
def remove_admin_department(current_user, department_id):
    try:
        deleted_department = delete_department(department_id, institution_id=current_user.get("institution_id"))
        return jsonify({
            "message": "Department deleted successfully",
            "department": deleted_department,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/subject/<int:subject_id>", methods=["DELETE"])
@token_required
@role_required("Admin")
def remove_admin_subject(current_user, subject_id):
    try:
        deleted_subject = delete_subject(subject_id, institution_id=current_user.get("institution_id"))
        return jsonify({
            "message": "Subject deleted successfully",
            "subject": deleted_subject,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/user/<int:user_id>", methods=["DELETE"])
@token_required
@role_required("Admin")
def remove_user(current_user, user_id):
    try:
        deleted_user = delete_user(
            user_id,
            current_user_id=current_user.get("user_id"),
            institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id"),
        )
        record_audit_event(
            "user.deleted",
            actor_user_id=current_user.get("user_id"),
            institution_id=None if current_user.get("is_super_admin") else current_user.get("institution_id"),
            entity_type="user",
            entity_id=user_id,
            metadata={"deleted_email": deleted_user.get("email")},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify({
            "message": "User deleted successfully",
            "user": deleted_user,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/context", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_admin_context(current_user):
    try:
        institution_id = None if current_user.get("is_super_admin") else current_user.get("institution_id")
        context_payload = get_institution_context(institution_id)
        context_payload["viewer"] = {
            "name": current_user.get("name"),
            "is_super_admin": current_user.get("is_super_admin"),
            "institution_code": current_user.get("institution_code"),
        }
        return jsonify(context_payload), 200
    except Exception:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/institutions", methods=["GET"])
@token_required
@role_required("Admin")
def fetch_institutions(current_user):
    if not current_user.get("is_super_admin"):
        return jsonify({"error": "Super admin access required"}), 403

    try:
        return jsonify(list_institutions()), 200
    except Exception:
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/admin/institutions", methods=["POST"])
@token_required
@role_required("Admin")
def create_admin_institution(current_user):
    if not current_user.get("is_super_admin"):
        return jsonify({"error": "Super admin access required"}), 403

    try:
        data = request.get_json() or {}
        institution = create_institution(
            data.get("name") or "",
            data.get("code") or "",
            subdomain=data.get("subdomain"),
            plan_name=(data.get("plan_name") or "starter"),
        )
        record_audit_event(
            "institution.created",
            actor_user_id=current_user.get("user_id"),
            institution_id=institution.get("id"),
            entity_type="institution",
            entity_id=institution.get("id"),
            metadata={"code": institution.get("code"), "plan_name": institution.get("plan_name")},
            ip_address=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
        )
        return jsonify({"message": "Institution created successfully", "institution": institution}), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception:
        return jsonify({"error": "An internal error occurred"}), 500


# ── Admin dashboard summary (merged from admin_dashboard_routes.py) ───────────
@admin_bp.route("/admin/dashboard/summary", methods=["GET"])
@token_required
@role_required("Admin")
def admin_dashboard_summary():
    """Institution-level KPI summary for the admin dashboard."""
    from services.admin_dashboard_service import get_admin_dashboard
    try:
        return jsonify(get_admin_dashboard()), 200
    except Exception as exc:
        logger.exception("admin_dashboard_summary failed")
        return jsonify({"error": "An internal error occurred"}), 500


@admin_bp.route("/students", methods=["GET"])
@token_required
def get_students_list():
    """Paginated + filterable student list. Used by placement form search."""
    from services.readiness_service import get_all_scored_students
    try:
        q    = request.args.get("q") or request.args.get("search")
        dept = request.args.get("department")
        sort = request.args.get("sort", "desc")
        per  = min(int(request.args.get("per_page", 20)), 100)
        students = get_all_scored_students(search=q, department=dept, sort_order=sort)
        return jsonify({"success": True, "data": students[:per], "count": len(students)}), 200
    except Exception as exc:
        logger.exception("get_students_list failed")
        return jsonify({"error": "An internal error occurred"}), 500
