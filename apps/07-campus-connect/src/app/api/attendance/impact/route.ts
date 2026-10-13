import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { projectLeaveImpact } from "@/lib/services/attendance";

/**
 * GET /api/attendance/impact?studentId=…&days=3
 * The leave-impact projection. Read-only and side-effect free — a student may
 * call it repeatedly while adjusting dates without creating anything.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const studentId = url.searchParams.get("studentId") ?? user.studentId;
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  // Students may only project for themselves; staff may project for anyone.
  const isSelf = studentId === user.studentId;
  if (!isSelf && !["FACULTY", "HOD", "ADMIN"].includes(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const days = Math.min(30, Math.max(0, Number(url.searchParams.get("days") ?? 1) || 0));
  const impact = await projectLeaveImpact(studentId, days);
  return NextResponse.json({ ok: true, days, impact });
}
