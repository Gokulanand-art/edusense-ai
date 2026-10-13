import { NextResponse } from "next/server";
import { authenticate, setSessionCookie, roleHome } from "@/lib/auth";
import { getDb } from "@/lib/db";

/**
 * Turn whatever the user typed into an account email.
 *
 * Three identifiers reach this app and the login screen advertises all three:
 *   - a full mail ID            hod.cse@campus.edu
 *   - a placement Login Id      G001        (local part of the mail ID)
 *   - a roll / registration no  24CS001
 *
 * Resolved server-side so the mapping lives in exactly one place. Order matters:
 * an exact mail match wins, then the Login Id, then the roll number.
 */
async function resolveIdentifier(raw: string, explicitRoll?: string): Promise<string> {
  const value = raw.trim();
  if (!value) return "";
  if (value.includes("@")) return value;

  const db = await getDb();

  // Placement Login Id — the local part of a student's mail ID. Matching the
  // local part avoids hardcoding a college domain here.
  try {
    const { rows } = await db.query<{ email: string }>(
      `SELECT email FROM users
        WHERE lower(split_part(email, '@', 1)) = lower($1) AND is_active
        LIMIT 1`,
      [value],
    );
    if (rows[0]?.email) return rows[0].email;
  } catch {
    /* fall through to the roll lookup */
  }

  // Roll or registration number. Also honour an explicit roll field so the
  // older portal form keeps working.
  const roll = (explicitRoll ?? value).trim();
  if (roll) {
    try {
      const { rows } = await db.query<{ email: string }>(
        `SELECT u.email
           FROM students s JOIN users u ON u.id = s.user_id
          WHERE upper(s.roll_number) = upper($1)
             OR upper(s.registration_no) = upper($1)
          LIMIT 1`,
        [roll],
      );
      if (rows[0]?.email) return rows[0].email;
    } catch {
      /* fall through */
    }
  }

  return value;
}

export async function POST(req: Request) {
  let body: { email?: string; password?: string; roll?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const identifier = await resolveIdentifier(body.email ?? "", body.roll);
    const user = await authenticate(identifier, body.password ?? "");

    if (!user) {
      // Deliberately vague: never reveal whether the identifier exists.
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await setSessionCookie(user.id);
    return NextResponse.json({
      ok: true,
      user: { id: user.id, name: `${user.firstName} ${user.lastName}`, role: user.role },
      redirect: roleHome(user.role),
    });
  } catch (err) {
    // A database or session failure must not surface as an unhandled worker
    // exception. Log the real cause server-side and report it as unavailable.
    console.error("[login] failed", err);
    const detail =
      process.env.NODE_ENV === "production"
        ? undefined
        : err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Please try again.", detail },
      { status: 503 },
    );
  }
}
