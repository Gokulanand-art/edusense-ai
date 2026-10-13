/**
 * Auth — signed cookie sessions, no NextAuth/ORM dependency.
 *
 * Rationale: the previous approach coupled auth to Prisma, which cannot run
 * here (no Postgres server installed). Sessions are a signed HttpOnly cookie
 * verified against the `users` table on every request — stateless, and the
 * role is always read from the DB rather than trusted from the token, so a
 * demoted user loses access immediately.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getDb, type QueryFn } from "@/lib/db";

export const ROLES = ["STUDENT", "FACULTY", "HOD", "ADMIN", "PARENT"] as const;
export type Role = (typeof ROLES)[number];

export const SESSION_COOKIE = "cc_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not configured");
  return s;
}

/* ---------------------------------------------------------------- passwords */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, expected] = parts;
  const actual = scryptSync(password, salt, 64);
  const expectedBuf = Buffer.from(expected, "hex");
  if (actual.length !== expectedBuf.length) return false;
  return timingSafeEqual(actual, expectedBuf);
}

/* ----------------------------------------------------------------- sessions */

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSessionToken(userId: string): string {
  const expires = Date.now() + SESSION_TTL_MS;
  const body = `${userId}.${expires}`;
  return `${body}.${sign(body)}`;
}

export function verifySessionToken(token: string | undefined): { userId: string } | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expires, signature] = parts;
  const expected = sign(`${userId}.${expires}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(expires) < Date.now()) return null;
  return { userId };
}

export async function setSessionCookie(userId: string) {
  cookies().set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export function clearSessionCookie() {
  cookies().set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

/* -------------------------------------------------------------------- users */

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  studentId?: string;
  facultyId?: string;
  /**
   * Department this user is scoped to, for staff (FACULTY / HOD).
   *
   * Department scoping is a *server-side* property carried on the session, read
   * from the database on every request. It is deliberately NOT accepted from a
   * query string, form field or route segment — if a caller could supply it, the
   * single-department boundary would be advisory rather than enforced.
   */
  departmentId?: string;
  departmentCode?: string;
}

/** Resolve the current user from the cookie. Role comes from the DB, not the token. */
export async function getCurrentUser(q?: QueryFn): Promise<SessionUser | null> {
  const token = cookies().get(SESSION_COOKIE)?.value;
  const verified = verifySessionToken(token);
  if (!verified) return null;

  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: Role;
    student_id: string | null;
    faculty_id: string | null;
    dept_id: string | null;
    dept_code: string | null;
  }>(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
            s.id AS student_id, f.id AS faculty_id,
            COALESCE(fdept.id, sdept.id, hdept.id) AS dept_id,
            COALESCE(fdept.code, sdept.code, hdept.code) AS dept_code
       FROM users u
       LEFT JOIN students s  ON s.user_id = u.id
       LEFT JOIN faculty  f  ON f.user_id = u.id
       LEFT JOIN departments fdept ON fdept.id = f.department_id
       LEFT JOIN departments sdept ON sdept.id = s.department_id
       LEFT JOIN departments hdept ON hdept.hod_user_id = u.id
      WHERE u.id = $1 AND u.is_active = true`,
    [verified.userId],
  );

  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    studentId: r.student_id ?? undefined,
    facultyId: r.faculty_id ?? undefined,
    departmentId: r.dept_id ?? undefined,
    departmentCode: r.dept_code ?? undefined,
  };
}

export async function authenticate(
  email: string,
  password: string,
  q?: QueryFn,
): Promise<SessionUser | null> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<{ id: string; password_hash: string; is_active: boolean }>(
    `SELECT id, password_hash, is_active FROM users WHERE lower(email) = lower($1)`,
    [email],
  );
  const user = rows[0];
  if (!user || !user.is_active) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  // Load the full profile for the id we just verified. This must be a direct
  // lookup — getCurrentUser() reads the session cookie, which does not exist
  // yet at login time.
  return loadUserById(user.id, run);
}

async function loadUserById(userId: string, run: QueryFn): Promise<SessionUser | null> {
  const { rows } = await run<{
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: Role;
    student_id: string | null;
    faculty_id: string | null;
    dept_id: string | null;
    dept_code: string | null;
  }>(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.role,
            s.id AS student_id, f.id AS faculty_id,
            COALESCE(fdept.id, sdept.id, hdept.id) AS dept_id,
            COALESCE(fdept.code, sdept.code, hdept.code) AS dept_code
       FROM users u
       LEFT JOIN students s  ON s.user_id = u.id
       LEFT JOIN faculty  f  ON f.user_id = u.id
       LEFT JOIN departments fdept ON fdept.id = f.department_id
       LEFT JOIN departments sdept ON sdept.id = s.department_id
       LEFT JOIN departments hdept ON hdept.hod_user_id = u.id
      WHERE u.id = $1 AND u.is_active = true`,
    [userId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    id: r.id,
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role,
    studentId: r.student_id ?? undefined,
    facultyId: r.faculty_id ?? undefined,
    departmentId: r.dept_id ?? undefined,
    departmentCode: r.dept_code ?? undefined,
  };
}

/* ------------------------------------------------------------------- guards */

export function roleHome(role: Role): string {
  switch (role) {
    case "STUDENT":
      return "/dashboard/student";
    case "FACULTY":
      return "/dashboard/faculty";
    case "HOD":
      return "/dashboard/hod";
    case "ADMIN":
      return "/dashboard/admin";
    case "PARENT":
      return "/dashboard/parent";
  }
}

export async function requireRole(...allowed: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  if (!allowed.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}