import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { applyForLeave, decideLeave, listLeaves } from "@/lib/services/attendance";
import { notifyStudentAndParent, audit } from "@/lib/notifications/system";
import { getDb } from "@/lib/db";

const LEAVE_TYPES = new Set([
  "CASUAL","SICK","MEDICAL","ON_DUTY","COMPENSATORY",
  "MATERNITY","PATERNITY","BEREAVEMENT","OTHER",
]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** POST = student applies; body also carries the pre-submit projection. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!user.studentId) return NextResponse.json({ error: "Not a student" }, { status: 403 });

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }

  const { leaveType, startDate, endDate, reason, hasMedicalCert } = b ?? {};
  if (!LEAVE_TYPES.has(leaveType)) return NextResponse.json({ error: "Invalid leaveType" }, { status: 400 });
  if (!ISO_DATE.test(startDate ?? "") || !ISO_DATE.test(endDate ?? "")) {
    return NextResponse.json({ error: "startDate/endDate must be YYYY-MM-DD" }, { status: 400 });
  }
  if (endDate < startDate) return NextResponse.json({ error: "endDate before startDate" }, { status: 400 });
  if (!reason || String(reason).trim().length < 3) {
    return NextResponse.json({ error: "Reason is required (min 3 chars)" }, { status: 400 });
  }
  if (new Date(endDate).getTime() - new Date(startDate).getTime() > 60 * 86_400_000) {
    return NextResponse.json({ error: "Leave longer than 60 days not supported" }, { status: 400 });
  }

  const { leaveId, impact } = await applyForLeave({
    studentId: user.studentId,
    leaveType,
    startDate,
    endDate,
    reason: String(reason).trim(),
    hasMedicalCert: !!hasMedicalCert,
  });

  await notifyStudentAndParent(user.studentId, {
    type: "LEAVE_REQUEST",
    severity: "INFO",
    title: "Leave request submitted",
    body: impact.summary,
    link: "/dashboard/student?tab=leave",
  });

  return NextResponse.json({ ok: true, leaveId, impact }, { status: 201 });
}

/** PATCH = staff decides. */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!["FACULTY", "HOD", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Bad body" }, { status: 400 }); }

  const { leaveId, decision, note } = b ?? {};
  if (!leaveId) return NextResponse.json({ error: "leaveId required" }, { status: 400 });
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return NextResponse.json({ error: "decision must be APPROVED or REJECTED" }, { status: 400 });
  }
  if (decision === "REJECTED" && (!note || String(note).trim().length < 3)) {
    return NextResponse.json({ error: "A rejection needs a reason" }, { status: 400 });
  }

  const db = await getDb();
  const { rows } = await db.query<{ student_id: string }>(
    `SELECT student_id FROM leaves WHERE id = $1`, [leaveId],
  );
  const target = rows[0];
  if (!target) return NextResponse.json({ error: "Leave not found" }, { status: 404 });

  const ok = await decideLeave(leaveId, user.id, decision, note);
  if (!ok) return NextResponse.json({ error: "Leave already decided" }, { status: 409 });

  await notifyStudentAndParent(target.student_id, {
    type: decision === "APPROVED" ? "LEAVE_APPROVED" : "LEAVE_REJECTED",
    severity: decision === "APPROVED" ? "SUCCESS" : "WARNING",
    title: `Leave ${decision.toLowerCase()}`,
    body: note ? String(note) : `Your leave request was ${decision.toLowerCase()}.`,
    link: "/dashboard/student?tab=leave",
    channels: ["IN_APP", "EMAIL", "SMS", "WHATSAPP"],
  });
  await audit(db.query, { actorId: user.id, action: `LEAVE_${decision}`, entity: "leave", entityId: leaveId, detail: { note } });

  return NextResponse.json({ ok: true, leaveId, decision });
}

/** GET = list, scoped by role. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? undefined;
  const studentId =
    ["FACULTY", "HOD", "ADMIN"].includes(user.role)
      ? url.searchParams.get("studentId") ?? undefined
      : user.studentId;

  return NextResponse.json({ ok: true, leaves: await listLeaves({ studentId, status, limit: 100 }) });
}
