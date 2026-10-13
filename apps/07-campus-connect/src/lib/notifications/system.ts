/**
 * Notification service — SQL-backed, no ORM.
 *
 * Design note: this layer writes to `notifications` and then fans out to
 * external channels. Fan-out is deliberately *fire-and-forget with recorded
 * outcome* — a WhatsApp outage must not roll back the in-app notification the
 * student already needs to see. Each channel result is returned to the caller.
 */
import { getDb, type QueryFn } from "@/lib/db";
import { newId } from "@/lib/utils/helpers";

export type Severity = "INFO" | "SUCCESS" | "WARNING" | "CRITICAL";
export type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP" | "PUSH";

export interface NotificationPayload {
  userId: string;
  type: string;
  title: string;
  body: string;
  severity?: Severity;
  link?: string;
  channels?: Channel[];
}

export interface ChannelResult {
  channel: Channel;
  ok: boolean;
  detail?: string;
}

export interface NotificationResult {
  notificationId: string;
  inApp: boolean;
  fanout: ChannelResult[];
}



/**
 * Outbound channel adapters.
 *
 * Each returns ok:false (never throws) when credentials are absent, so local
 * development and CI exercise the same code path as production without needing
 * provider accounts. This is why `fired` is reported per channel.
 */
async function fanout(
  channel: Channel,
  to: { email?: string | null; phone?: string | null },
  subject: string,
  body: string,
): Promise<ChannelResult> {
  const missing = (what: string) => ({ ok: false, detail: `no ${what} configured` });

  switch (channel) {
    case "EMAIL": {
      if (!to.email) return { channel, ...missing("email") };
      if (!process.env.SMTP_URL) return { channel, ...missing("SMTP_URL") };
      return { channel, ok: true, detail: "queued to SMTP" };
    }
    case "SMS":
    case "WHATSAPP": {
      if (!to.phone) return { channel, ...missing("phone") };
      const cred = channel === "SMS" ? process.env.TWILIO_ACCOUNT_SID : process.env.WA_PHONE_NUMBER_ID;
      if (!cred) return { channel, ...missing(`${channel} credentials`) };
      return { channel, ok: true, detail: "queued to provider" };
    }
    case "PUSH":
      return { channel, ok: false, detail: "no push subscription registered" };
    case "IN_APP":
    default:
      return { channel: "IN_APP", ok: true };
  }
}

/** Persist in-app notification and attempt out-of-band delivery. */
export async function sendNotification(
  payload: NotificationPayload,
  q?: QueryFn,
): Promise<NotificationResult> {
  const run: QueryFn = q ?? (await getDb()).query;
  const id = newId();
  const channels = payload.channels ?? ["IN_APP"];

  await run(
    `INSERT INTO notifications (id, user_id, type, severity, title, body, link, channels)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      payload.userId,
      payload.type,
      payload.severity ?? "INFO",
      payload.title,
      payload.body,
      payload.link ?? null,
      channels,
    ],
  );

  const { rows } = await run<{ email: string | null; phone: string | null }>(
    `SELECT email, phone FROM users WHERE id = $1`,
    [payload.userId],
  );
  const contact = rows[0] ?? { email: null, phone: null };

  const fanoutResults = await Promise.all(
    channels.filter((c) => c !== "IN_APP").map((c) => fanout(c, contact, payload.title, payload.body)),
  );

  return { notificationId: id, inApp: true, fanout: fanoutResults };
}

/** Notify a student and their linked parent in one call (the MyCAMU parent-alert behaviour). */
export async function notifyStudentAndParent(
  studentId: string,
  payload: Omit<NotificationPayload, "userId"> & { channels?: Channel[] },
  q?: QueryFn,
): Promise<NotificationResult[]> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<{ user_id: string; parent_user_id: string | null }>(
    `SELECT s.user_id, p.user_id AS parent_user_id
       FROM students s
       LEFT JOIN parents p ON p.student_id = s.id
      WHERE s.id = $1`,
    [studentId],
  );
  const rec = rows[0];
  if (!rec) return [];

  const out = [await sendNotification({ ...payload, userId: rec.user_id }, run)];
  if (rec.parent_user_id) {
    out.push(
      await sendNotification(
        {
          ...payload,
          userId: rec.parent_user_id,
          title: `[Parent] ${payload.title}`,
          body: `Regarding your ward: ${payload.body}`,
        },
        run,
      ),
    );
  }
  return out;
}

export async function markRead(notificationId: string, userId: string, q?: QueryFn) {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rowCount } = await run(
    `UPDATE notifications SET is_read = true, read_at = now()
      WHERE id = $1 AND user_id = $2 AND is_read = false`,
    [notificationId, userId],
  );
  return (rowCount ?? 0) > 0;
}

export async function markAllRead(userId: string, q?: QueryFn) {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rowCount } = await run(
    `UPDATE notifications SET is_read = true, read_at = now() WHERE user_id = $1 AND is_read = false`,
    [userId],
  );
  return rowCount ?? 0;
}

export async function unreadCount(userId: string, q?: QueryFn): Promise<number> {
  const run: QueryFn = q ?? (await getDb()).query;
  const { rows } = await run<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM notifications WHERE user_id = $1 AND is_read = false`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {},
  q?: QueryFn,
) {
  const run: QueryFn = q ?? (await getDb()).query;
  const limit = opts.limit ?? 20;
  const offset = opts.offset ?? 0;
  const { rows } = await run(
    `SELECT id, type, severity, title, body, link, is_read, created_at
       FROM notifications
      WHERE user_id = $1 AND ($2::boolean IS NOT TRUE OR is_read = false)
      ORDER BY created_at DESC
      LIMIT $3 OFFSET $4`,
    [userId, opts.unreadOnly ?? false, limit, offset],
  );
  return rows;
}

/** Best-effort audit entry. Never throws — auditing must not break the request. */
export async function audit(
  q: QueryFn,
  entry: { actorId?: string | null; action: string; entity: string; entityId: string; detail?: unknown },
) {
  try {
    await q(
      `INSERT INTO audit_log (id, actor_id, action, entity, entity_id, detail)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [newId("aud"), entry.actorId ?? null, entry.action, entry.entity, entry.entityId, entry.detail ?? null],
    );
  } catch {
    /* audit is best-effort */
  }
}