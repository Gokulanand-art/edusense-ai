import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { prisma } from "@/lib/db/prisma";

export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return undefined;

  // Always resolve user ID from active database to prevent stale session cookies
  try {
    const dbUser = await prisma.user.findUnique({
      where: { email: session.user.email.toLowerCase().trim() },
      select: { id: true, name: true, email: true, role: true },
    });
    if (dbUser) {
      return dbUser as { id: string; name: string; email: string; role: "STUDENT" | "ADMIN" };
    }
  } catch (err) {
    // Database connection fallback
  }

  return session.user as { id: string; name: string; email: string; role: "STUDENT" | "ADMIN" };
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized: Please log in to continue");
  }
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== "ADMIN") {
    throw new Error("Forbidden: Admin access required");
  }
  return user;
}
