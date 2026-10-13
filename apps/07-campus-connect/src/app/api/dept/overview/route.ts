import { getDb } from "@/lib/db";
import { requireStaffScope, scopeErrorResponse } from "@/lib/services/scope";
import { deptKpis, deptSubjects, deptTrend, deptFaculty, deptCoverage } from "@/lib/services/department";

/**
 * GET /api/dept/overview
 * One round-trip payload for the department landing view.
 * Scope comes from the session; there is no department query parameter.
 */
export async function GET() {
  try {
    const scope = await requireStaffScope()
    const db = await getDb()
    const q = db.query

    const [kpis, subjects, trend, faculty, coverage] = await Promise.all([
      deptKpis(scope.departmentId, null, q),
      deptSubjects(scope.departmentId, scope.subjectIds, q),
      deptTrend(scope.departmentId, 8, null, q),
      // The staff roster is department-level even for a lecturer — knowing who
      // teaches what in your own department is not a cross-department read.
      deptFaculty(scope.departmentId, q),
      deptCoverage(scope.departmentId, q),
    ])

    return Response.json({
      ok: true,
      scope: {
        departmentId: scope.departmentId,
        departmentCode: scope.departmentCode,
        role: scope.user.role,
        isHod: scope.isHod,
        subjectCodes: scope.subjectCodes,
        narrowedToOwnSubjects: scope.subjectIds !== null,
      },
      kpis,
      subjects,
      trend,
      faculty,
      coverage,
    })
  } catch (err) {
    return scopeErrorResponse(err)
  }
}
