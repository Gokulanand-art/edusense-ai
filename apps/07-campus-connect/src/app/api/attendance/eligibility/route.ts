import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { examEligibility, getOverallAttendance, getSubjectAttendance } from "@/lib/services/attendance";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const isStaff = ["FACULTY", "HOD", "ADMIN"].includes(user.role);
  const studentId = isStaff
    ? new URL(req.url).searchParams.get("studentId") ?? null
    : user.studentId ?? null;
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  return NextResponse.json({
    ok: true,
    overall: await getOverallAttendance(studentId),
    subjects: await getSubjectAttendance(studentId),
    eligibility: await examEligibility(studentId),
  });
}
