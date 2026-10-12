from database import get_db_connection
import logging
logger = logging.getLogger(__name__)
from flask import Blueprint, g, render_template, jsonify, request
from services.faculty_dashboard_service import (
    create_student_intervention,
    get_all_students_dashboard,
    get_classroom_roster,
    get_faculty_dashboard_summary,
    get_student_detail,
    save_classroom_attendance,
    save_classroom_marks,
    update_student_intervention_status,
)
from auth.auth_middleware import token_required, role_required
from auth.current_user import current_institution_id, current_user_id

faculty_dashboard_bp = Blueprint("faculty_dashboard_bp", __name__)


@faculty_dashboard_bp.route("/faculty/dashboard", methods=["GET"])
@token_required
@role_required("Faculty")
def faculty_dashboard():
    try:
        institution_id = current_institution_id()
        status_filter = request.args.get("status")
        sort_order = request.args.get("sort")
        search = request.args.get("search")
        department = request.args.get("department")

        data = get_all_students_dashboard(
            filter_status=status_filter,
            sort_order=sort_order,
            search=search,
            department=department,
            institution_id=institution_id,
        )

        return jsonify(data), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/summary", methods=["GET"])
@token_required
@role_required("Faculty")
def faculty_summary():
    try:
        institution_id = current_institution_id()
        status_filter = request.args.get("status")
        sort_order = request.args.get("sort")
        search = request.args.get("search")
        department = request.args.get("department")

        return jsonify(
            get_faculty_dashboard_summary(
                search=search,
                department=department,
                filter_status=status_filter,
                sort_order=sort_order,
                institution_id=institution_id,
            )
        ), 200

    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/student/<int:student_id>", methods=["GET"])
@token_required
@role_required("Faculty")
def faculty_student_detail(student_id):
    try:
        return jsonify(get_student_detail(student_id, institution_id=current_institution_id())), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/student/<int:student_id>/interventions", methods=["POST"])
@token_required
@role_required("Faculty")
def faculty_student_intervention(student_id):
    try:
        data = request.get_json() or {}
        institution_id = current_institution_id()
        intervention = create_student_intervention(
            student_id,
            current_user_id(),
            data,
            institution_id=institution_id,
        )
        return jsonify({
            "message": "Support intervention saved successfully",
            "intervention": intervention,
        }), 201

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/intervention/<int:intervention_id>", methods=["PATCH"])
@token_required
@role_required("Faculty")
def faculty_update_intervention(intervention_id):
    try:
        data = request.get_json() or {}
        institution_id = current_institution_id()
        intervention = update_student_intervention_status(
            intervention_id,
            data.get("status"),
            current_user_id(),
            institution_id=institution_id,
        )
        return jsonify({
            "message": "Support intervention updated successfully",
            "intervention": intervention,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/classroom", methods=["GET"])
@token_required
@role_required("Faculty")
def faculty_classroom():
    try:
        institution_id = current_institution_id()
        subject_id = request.args.get("subject_id", type=int)
        if not subject_id:
            return jsonify({"error": "subject_id is required"}), 400

        return jsonify(
            get_classroom_roster(
                subject_id=subject_id,
                department=request.args.get("department"),
                search=request.args.get("search"),
                institution_id=institution_id,
            )
        ), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/classroom/attendance", methods=["POST"])
@token_required
@role_required("Faculty")
def faculty_classroom_attendance():
    try:
        institution_id = current_institution_id()
        data = request.get_json() or {}

        if "subject_id" not in data:
            return jsonify({"error": "subject_id is required"}), 400

        result = save_classroom_attendance(
            data["subject_id"],
            data.get("entries") or [],
            institution_id=institution_id,
        )
        return jsonify({
            "message": "Class attendance saved successfully",
            **result,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


@faculty_dashboard_bp.route("/faculty/classroom/marks", methods=["POST"])
@token_required
@role_required("Faculty")
def faculty_classroom_marks():
    try:
        institution_id = current_institution_id()
        data = request.get_json() or {}

        if "subject_id" not in data:
            return jsonify({"error": "subject_id is required"}), 400

        result = save_classroom_marks(
            data["subject_id"],
            data.get("exam_type"),
            data.get("entries") or [],
            institution_id=institution_id,
        )
        return jsonify({
            "message": "Class marks saved successfully",
            **result,
        }), 200

    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "An internal error occurred"}), 500


# ── Bulk marks entry ──────────────────────────────────────────────────────────
@faculty_dashboard_bp.route("/faculty/marks/bulk", methods=["POST"])
@token_required
@role_required("Faculty")
def bulk_enter_marks():
    """
    Accept an array of {student_id, subject_id, marks, max_marks} objects.
    Upserts marks — re-entering a score overwrites the previous value.
    Returns per-student success/failure so the UI can highlight errors.
    """
    data = request.get_json(silent=True) or {}
    entries = data.get("entries", [])
    if not entries:
        return jsonify({"success": False, "error": "No entries provided"}), 400

    institution_id = g.institution_id
    results = []

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            for entry in entries:
                sid  = entry.get("student_id")
                subj = entry.get("subject_id")
                mrks = entry.get("marks")
                mmax = entry.get("max_marks", 100)

                if sid is None or subj is None or mrks is None:
                    results.append({"student_id": sid, "ok": False, "error": "Missing fields"})
                    continue

                try:
                    exam_type = entry.get("exam_type", "Internal")
                    mrks = float(mrks)
                    mmax = float(mmax)
                    if mrks < 0 or mrks > mmax:
                        raise ValueError(f"Marks {mrks} out of range [0, {mmax}]")

                    # Tenant check: student and subject must belong to this institution
                    cur.execute(
                        """SELECT s.id FROM students s
                           JOIN subjects sub ON sub.id = %s AND sub.institution_id = %s
                           WHERE s.id = %s AND s.institution_id = %s""",
                        (subj, institution_id, sid, institution_id)
                    )
                    if not cur.fetchone():
                        results.append({"student_id": sid, "ok": False, "error": "Not found"})
                        continue

                    # Upsert: update if exists, insert if not
                    cur.execute(
                        """UPDATE marks SET marks = %s, max_marks = %s
                           WHERE student_id = %s AND subject_id = %s
                             AND exam_type = %s""",
                        (mrks, mmax, sid, subj, exam_type)
                    )
                    if cur.rowcount == 0:
                        cur.execute(
                            """INSERT INTO marks (student_id, subject_id, marks, max_marks, exam_type)
                               VALUES (%s, %s, %s, %s, %s)""",
                            (sid, subj, mrks, mmax, exam_type)
                        )
                    results.append({"student_id": sid, "ok": True})
                except Exception as exc:
                    results.append({"student_id": sid, "ok": False, "error": str(exc)})

    saved   = sum(1 for r in results if r["ok"])
    failed  = len(results) - saved
    return jsonify({
        "success": True,
        "saved":  saved,
        "failed": failed,
        "results": results,
    }), 200


@faculty_dashboard_bp.route("/faculty/bulk-marks", methods=["GET"])
@token_required
@role_required("Faculty")
def bulk_marks_page():
    """Render the faculty bulk marks entry page."""
    return render_template("faculty_bulk_marks.html")


@faculty_dashboard_bp.route("/faculty/students-for-marks", methods=["GET"])
@token_required
@role_required("Faculty")
def students_for_marks():
    """
    Returns all students enrolled in a subject, with their existing marks
    for the given exam_type (so faculty can see what's already entered).
    """
    subject_id = request.args.get("subject_id", type=int)
    exam_type  = request.args.get("exam_type", "Internal")
    institution_id = g.institution_id

    if not subject_id:
        return jsonify({"success": False, "error": "subject_id is required"}), 400

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.id, s.name, s.roll_number, s.department,
                           m.marks AS existing_marks, m.max_marks
                    FROM students s
                    LEFT JOIN marks m
                        ON m.student_id = s.id
                       AND m.subject_id = %s
                       AND m.exam_type  = %s
                    WHERE s.institution_id = %s
                    ORDER BY s.department, s.name
                """, (subject_id, exam_type, institution_id))
                rows = cur.fetchall()

        students = [
            {
                "id": r[0], "name": r[1], "roll_number": r[2],
                "department": r[3], "existing_marks": r[4],
                "max_marks": r[5],
            }
            for r in rows
        ]
        return jsonify({"success": True, "students": students}), 200
    except Exception as exc:
        logger.exception("students_for_marks failed")
        return jsonify({"success": False, "error": str(exc)}), 500
