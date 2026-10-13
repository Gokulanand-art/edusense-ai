import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getMarks, getCgpaHistory, computeSgpa } from "@/lib/services/marks";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const url = new URL(req.url);
  const requested = url.searchParams.get("studentId") ?? undefined;
  const isStaff = ["FACULTY", "HOD", "ADMIN"].includes(user.role);
  const studentId = isStaff ? requested ?? null : user.studentId ?? null;
  if (!studentId) return NextResponse.json({ error: "studentId required" }, { status: 400 });

  const semRaw = url.searchParams.get("semester");
  const semester = semRaw ? Number(semRaw) : undefined;

  const marks = await getMarks(studentId, semester);
  const history = await getCgpaHistory(studentId);
  const latest = history.at(-1) ?? null;
  const recomputed = latest ? await computeSgpa(studentId, latest.semester) : null;

  return NextResponse.json({
    ok: true,
    marks,
    cgpaHistory: history,
    latestCgpa: latest,
    // Reported, not corrected: a mismatch means the published record and the
    // marks disagree, which an admin must resolve.
    reconciliation:
      latest && recomputed
        ? {
            semester: latest.semester,
            publishedSgpa: latest.sgpa,
            recomputedSgpa: recomputed.sgpa,
            matches: latest.sgpa === recomputed.sgpa,
          }
        : null,
  });
}
