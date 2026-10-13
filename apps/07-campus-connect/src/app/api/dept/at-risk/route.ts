import { getDb } from "@/lib/db";
import { requireStaffScope, scopeErrorResponse } from "@/lib/services/scope";
import { deptAtRisk } from "@/lib/services/department";

export async function GET() {
  try {
    const scope = await requireStaffScope()
    const db = await getDb()
    return Response.json({
      ok: true,
      scope: { role: scope.user.role, narrowedToOwnSubjects: scope.subjectIds !== null },
      students: await deptAtRisk(scope.departmentId, scope.subjectIds, db.query),
    })
  } catch (err) {
    return scopeErrorResponse(err)
  }
}
