import threading
import uuid
from datetime import datetime, UTC

from services.admin_service import build_admin_export, get_admin_stats

_JOBS = {}
_LOCK = threading.Lock()


def _now():
    return datetime.now(UTC).isoformat()


def _set_job(job_id, **updates):
    with _LOCK:
        job = _JOBS.setdefault(job_id, {})
        job.update(updates)
        return dict(job)


def _run_report_job(job_id, report_type, institution_id):
    try:
        _set_job(job_id, status="running", started_at=_now())
        if report_type == "readiness":
            result = get_admin_stats(institution_id=institution_id)
        else:
            result = build_admin_export(report_type, institution_id=institution_id)

        _set_job(job_id, status="completed", result=result, completed_at=_now())
    except Exception as exc:
        _set_job(job_id, status="failed", error=str(exc), completed_at=_now())


def create_report_job(report_type, institution_id=None):
    normalized_type = (report_type or "readiness").strip().lower()
    if normalized_type not in {"readiness", "students", "users", "subjects", "interventions"}:
        raise ValueError("Unsupported report type")

    job_id = str(uuid.uuid4())
    _set_job(
        job_id,
        id=job_id,
        report_type=normalized_type,
        institution_id=institution_id,
        status="queued",
        created_at=_now(),
    )

    worker = threading.Thread(
        target=_run_report_job,
        args=(job_id, normalized_type, institution_id),
        daemon=True,
    )
    worker.start()
    return get_report_job(job_id)


def get_report_job(job_id):
    with _LOCK:
        job = _JOBS.get(job_id)
        return dict(job) if job else None
