import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { listNotifications, markRead, markAllRead, unreadCount } from "@/lib/notifications/system";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  return NextResponse.json({
    ok: true,
    unread: await unreadCount(user.id),
    items: await listNotifications(user.id, {
      limit: Number(url.searchParams.get("limit") ?? 20),
      unreadOnly: url.searchParams.get("unread") === "1",
    }),
  });
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const affected = b.all ? await markAllRead(user.id) : b.id ? Number(await markRead(b.id, user.id)) : 0;
  return NextResponse.json({ ok: true, affected });
}
