/**
 * Department scope guard.
 *
 * A single choke point every staff route goes through. Returns the caller's
 * department scope or throws — routes never read a department id from the
 * request, so there is no code path by which a caller can widen their own scope.
 */
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { facultySubjects } from "@/lib/services/department";

export interface StaffScope {
  user: SessionUser;
  departmentId: string;
  departmentCode: string;
  isHod: boolean;
  /** Subjects this staff member owns. Null for an HOD, who sees the department. */
  subjectIds: string[] | null;
  subjectCodes: string[];
}

export class ScopeError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireStaffScope(opts: { hodOnly?: boolean } = {}): Promise<StaffScope> {
  const user = await getCurrentUser();
  if (!user) throw new ScopeError(401, "Unauthenticated");

  if (user.role === "ADMIN") {
    // Admins are institution-wide by role, not department-scoped. They do not
    // get a department scope here — the admin surface handles them separately.
    throw new ScopeError(403, "Admin accounts do not use the department surface");
  }
  if (user.role !== "FACULTY" && user.role !== "HOD") {
    throw new ScopeError(403, "Staff access only");
  }
  if (opts.hodOnly && user.role !== "HOD") {
    throw new ScopeError(403, "HOD only");
  }
  if (!user.departmentId) {
    throw new ScopeError(403, "No department assigned to this account");
  }

  // A staff member is additionally narrowed to the subjects they own.
  // An HOD is not: department scope is the whole point of the HOD role.
  let subjectIds: string[] | null = null
  let subjectCodes: string[] = []

  if (user.role === "FACULTY" && user.facultyId) {
    const subs = await facultySubjects(user.facultyId)
    subjectIds = subs.map((s) => s.subjectId)
    subjectCodes = subs.map((s) => s.code)
  }

  return {
    user,
    departmentId: user.departmentId,
    departmentCode: user.departmentCode ?? "",
    isHod: user.role === "HOD",
    subjectIds,
    subjectCodes,
  }
}

/** Uniform error envelope so route handlers stay thin. */
export function scopeErrorResponse(err: unknown): Response {
  if (err instanceof ScopeError) {
    return Response.json({ error: err.message }, { status: err.status })
  }
  console.error("department route failed:", err)
  return Response.json({ error: "Internal error" }, { status: 500 })
}