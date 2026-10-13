import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireStaffScope, scopeErrorResponse } from "@/lib/services/scope";
import { deptLeaves } from "@/lib/services/department";
import { notifyStudentAndParent, audit } from "@/lib/notifications/system";
import { decideLeave, projectLeaveImpact } from "@/lib/services/attendance";

export async function GET(req: Request) {
  try {
    const scope = await requireStaffScope()
    const status = new URL(req.url).searchParams.get("status") ?? undefined
    const db = await getDb()
    return Response.json({
      ok: true,
      leaves: await deptLeaves(scope.departmentId, status, db.query),
    })
  } catch (err) {
    return scopeErrorResponse(err)
  }
}

/**
 * PATCH — approve or reject a leave.
 *
 * Two guards that matter:
 *  - the leave must belong to a student in *this* department (re-checked here
 *    rather than trusting the id the client sent);
 *  - a leave that would breach the 75% threshold cannot be approved by an
 *    ordinary lecturer without an explicit override note. Silently approving a
 *    leave that pushes a student below exam eligibility is the failure mode
 *    worth preventing, and it is better surfaced at decision time than after.
 */
export async function PATCH(req: Request) {
  try {
    const scope = await requireStaffScope()
    const body = await req.json().catch(() => ({}))
    const { leaveId, decision, note, override } = body ?? {}

    if (!leaveId) return NextResponse.json({ error: "leaveId required" }, { status: 400 })
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 })
    }
    if (decision === "REJECTED" && (!note || String(note).trim().length < 3)) {
      return NextResponse.json({ error: "A rejection needs a reason" }, { status: 400 })
    }

    const db = await getDb()

    const { rows } = await db.query<any>(
      `SELECT l.student_id, l.status, l.impact_snapshot, s.department_id
         FROM leaves l
         JOIN students s ON s.id = l.student_id
        WHERE l.id = $1`,
      [leaveId],
    )
    const leave = rows[0]
    if (!leave) return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    if (leave.department_id !== scope.departmentId) {
      // Do not disclose existence across the department boundary.
      return NextResponse.json({ error: "Leave not found" }, { status: 404 })
    }
    if (leave.status !== "PENDING") {
      return NextResponse.json({ error: "Leave already decided" }, { status: 409 })
    }

    if (decision === "APPROVED") {
      // Fail closed. A missing/blank snapshot used to fall through as
      // breach=false, which meant any leave not created through the student
      // apply endpoint could be approved regardless of the 75% rule. Recompute
      // from live attendance instead, and only wave it through if the
      // projection genuinely cannot be determined AND the caller overrides.
      const snap =
        leave.impact_snapshot && typeof leave.impact_snapshot === "object"
          ? leave.impact_snapshot
          : null

      let breach: boolean
      let projected: number | null = null
      let current: number | null = null

      if (snap) {
        breach = snap.overallWillBreach === true || (snap.overallProjected ?? 100) < 75
        projected = snap.overallProjected ?? null
        current = snap.overallCurrent ?? null
      } else {
        // No snapshot: recompute with the same projection the student saw at
        // apply time (real per-subject class cadence), rather than a flat
        // haircut — so a staff decision is never based on a worse estimate
        // than the one the student was shown.
        const { rows: dr } = await db.query<{ no_of_days: number }>(
          `SELECT no_of_days FROM leaves WHERE id = $1`,
          [leaveId],
        )
        const impact = await projectLeaveImpact(
          leave.student_id,
          Number(dr[0]?.no_of_days ?? 0),
          db.query,
        )
        projected = impact.overallProjected
        current = impact.overallCurrent
        breach = impact.overallWillBreach || projected < 75
      }

      if (breach && !override) {
        return NextResponse.json(
          {
            error: "Approving this leave drops the student below the 75% exam-eligibility threshold",
            requiresOverride: true,
            projected,
            current,
            riskLevel: snap?.riskLevel ?? (breach ? "HIGH" : "LOW"),
            recomputed: !snap,
          },
          { status: 409 },
        )
      }
    }

    const ok = await decideLeave(leaveId, scope.user.id, decision, note)
    if (!ok) return NextResponse.json({ error: "Leave already decided" }, { status: 409 })

    await notifyStudentAndParent(leave.student_id, {
      type: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
      severity: decision === "APPROVED" ? "SUCCESS" : "WARNING",
      title: `Leave ${decision.toLowerCase()}`,
      body: note ? String(note) : `Your leave request was ${decision.toLowerCase()} by the department.`,
      link: "/dashboard/student?tab=leave",
      channels: ["IN_APP", "EMAIL", "SMS", "WHATSAPP"],
    })
    await audit(db.query, {
      actorId: scope.user.id,
      action: `LEAVE_${decision}`,
      entity: "leave",
      entityId: leaveId,
      detail: { departmentId: scope.departmentId, note, override: !!override },
    })

    return NextResponse.json({ ok: true, leaveId, decision })
  } catch (err) {
    return scopeErrorResponse(err)
  }
}
