/**
 * Database adapter — Campus Connect.
 *
 * Mirrors the proven pattern in `hackathon/lib/db.ts`: two interchangeable
 * backends, both real PostgreSQL:
 *   1. `pg` Pool     — when DATABASE_URL is set (Supabase/Neon/self-hosted).
 *   2. `pglite`      — embedded Postgres 16 (WASM), filesystem-persisted under
 *                      ./data/campus-connect. Zero-config local dev while
 *                      preserving real SQL semantics: transactions, CHECK
 *                      constraints, partial unique indexes, FK enforcement.
 *
 * Postgres is NOT installed on this machine (no psql/postgres binary), which
 * is why pglite is the default rather than an optional convenience.
 *
 * Both backends expose `query` + `transaction`, so application code talks to
 * one interface.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { migrations } from "./migrations";

export interface QueryResultRow {
  [key: string]: unknown;
}
export type QueryFn = <T = QueryResultRow>(
  text: string,
  params?: unknown[],
) => Promise<{ rows: T[]; rowCount?: number }>;

export interface DbAdapter {
  query: QueryFn;
  transaction: <T>(fn: (q: QueryFn) => Promise<T>) => Promise<T>;
  close: () => Promise<void>;
  readonly kind: "pg" | "pglite";
}

async function createPgliteAdapter(): Promise<DbAdapter> {
  const { PGlite } = await import("@electric-sql/pglite");
  const dataDir = process.env.PGLITE_DATA_DIR || "./data/campus-connect";
  if (dataDir && dataDir !== ":memory:") {
    mkdirSync(path.resolve(process.cwd(), dataDir), { recursive: true });
  }
  const db = new PGlite(dataDir);

  const query: QueryFn = async <T = QueryResultRow>(text: string, params?: unknown[]) => {
    const res = await db.query(text, params as unknown[]);
    return {
      rows: res.rows as unknown as T[],
      rowCount: (res as unknown as { affectedRows?: number }).affectedRows ?? undefined,
    };
  };

  const transaction: DbAdapter["transaction"] = async <T>(fn: (q: QueryFn) => Promise<T>) => {
    return db.transaction(async (tx) => {
      const q: QueryFn = async <U = QueryResultRow>(text: string, params?: unknown[]) => {
        const res = await tx.query(text, params as unknown[]);
        return {
          rows: res.rows as unknown as U[],
          rowCount: (res as unknown as { affectedRows?: number }).affectedRows ?? undefined,
        };
      };
      return fn(q);
    });
  };

  return {
    kind: "pglite",
    query,
    transaction,
    close: async () => {
      try {
        await db.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Resolve how to reach Postgres, and which driver to use.
 *
 * Cloudflare Workers cannot open raw TCP sockets, so `pg` there is unreliable —
 * it failed intermittently with worker error 1101. Neon's serverless driver
 * speaks the Postgres wire protocol over a WebSocket instead, which Workers
 * supports natively, so it is used on Workers and `pg` everywhere else.
 *
 * The Workers connection string is supplied as a Worker *secret*
 * (DATABASE_URL), never baked into the bundle.
 */
async function resolvePgConnection(): Promise<{
  connectionString: string;
  driver: "neon" | "pg";
}> {
  const onWorkers =
    typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
  if (onWorkers) {
    return { connectionString: process.env.DATABASE_URL ?? "", driver: "neon" };
  }
  return { connectionString: process.env.DATABASE_URL ?? "", driver: "pg" };
}

async function createPgAdapter(): Promise<DbAdapter> {
  const { connectionString, driver } = await resolvePgConnection();
  const onWorkers = driver === "neon";

  /**
   * The two pools expose the same query/connect/release/end surface but have
   * unrelated TypeScript types, so this adapter talks to the small structural
   * subset it actually uses rather than to either package's Pool type.
   */
  interface DriverClient {
    query(
      text: string,
      params?: unknown[],
    ): Promise<{ rows: unknown[]; rowCount?: number | null }>;
    release(destroy?: boolean): void;
  }
  interface DriverPool {
    query(text: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
    connect(): Promise<DriverClient>;
    end(): Promise<void>;
    on(event: string, cb: () => void): void;
  }

  // node-postgres on Node; Neon's WebSocket driver on Workers.
  type PoolCtor = new (cfg: {
    connectionString: string;
    max: number;
    connectionTimeoutMillis: number;
    idleTimeoutMillis: number;
    keepAlive: boolean;
  }) => DriverPool;

  // node-postgres on Node; Neon's WebSocket driver on Workers.
  const PoolImpl = onWorkers
    ? ((await import("@neondatabase/serverless")).Pool as unknown as PoolCtor)
    : ((await import("pg")).Pool as unknown as PoolCtor);

  // A WebSocket session is far more expensive than a socket, so keep the fan-out
  // small; the driver multiplexes queries over it.
  const pool = new PoolImpl({
    connectionString,
    max: onWorkers ? 2 : 8,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });
  // pg emits 'error' on idle pooled clients whose socket died server-side;
  // without a handler the event is uncaught and crashes the worker.
  pool.on("error", () => {
    /* socket already closed; next checkout opens a fresh connection */
  });

  const isConnError = (err: unknown): boolean => {
    const msg = (err as Error)?.message ?? "";
    return /proxy request failed|connect|ECONNRESET|socket/i.test(msg);
  };

  const query: QueryFn = async <T = QueryResultRow>(text: string, params?: unknown[]) => {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await pool.query(text, params as unknown[]);
        return { rows: res.rows as unknown as T[], rowCount: res.rowCount ?? undefined };
      } catch (err) {
        if (attempt === 0 && isConnError(err)) continue;
        throw err;
      }
    }
  };

  const transaction: DbAdapter["transaction"] = async <T>(fn: (q: QueryFn) => Promise<T>) => {
    for (let attempt = 0; ; attempt++) {
      let client: DriverClient | undefined;
      try {
        client = await pool.connect();
        await client.query("BEGIN");
        const q: QueryFn = async <U = QueryResultRow>(text: string, params?: unknown[]) => {
          const res = await client!.query(text, params as unknown[]);
          return { rows: res.rows as unknown as U[], rowCount: res.rowCount ?? undefined };
        };
        const result = await fn(q);
        await client.query("COMMIT");
        client.release();
        return result;
      } catch (err) {
        if (client) {
          await client.query("ROLLBACK").catch(() => {});
          client.release(true);
        }
        if (attempt === 0 && isConnError(err)) continue;
        throw err;
      }
    }
  };

  return {
    kind: "pg",
    query,
    transaction,
    close: async () => {
      try {
        await pool.end();
      } catch {
        /* ignore */
      }
    },
  };
}

/** Apply pending migrations; each runs in one transaction so it rolls back cleanly. */
async function runMigrations(adapter: DbAdapter): Promise<void> {
  await adapter.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const { rows } = await adapter.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.name));

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;
    const statements = splitStatements(migration.sql).filter((s) => {
      const t = s.trim().toUpperCase();
      return t.length > 0 && t !== "BEGIN" && t !== "COMMIT" && t !== "ROLLBACK" && !t.startsWith("END");
    });
    await adapter.transaction(async (q) => {
      for (const stmt of statements) {
        await q(stmt);
      }
      await q("INSERT INTO schema_migrations(name) VALUES ($1) ON CONFLICT DO NOTHING", [
        migration.name,
      ]);
    });
  }
}

/**
 * Singleton on globalThis, not module scope: Next.js compiles pages and route
 * handlers into separate module registries, so a module-scoped singleton would
 * open two PGlite instances on the same data dir → intermittent WASM aborts.
 */
const GLOBAL_DB_KEY = "__cc_db_adapter_promise";
type GlobalWithDb = typeof globalThis & { [GLOBAL_DB_KEY]?: Promise<DbAdapter> };

export async function getDb(): Promise<DbAdapter> {
  const g = globalThis as GlobalWithDb;
  if (!g[GLOBAL_DB_KEY]) {
    const pending = (async () => {
      // pglite needs a writable filesystem, which Workers do not have, so on
      // Workers the real database is reached over Neon's WebSocket driver.
      const onWorkers =
        typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";
      const adapter =
        onWorkers || process.env.DATABASE_URL
          ? await createPgAdapter()
          : await createPgliteAdapter();
      // Applying seven migrations on every Workers cold start burned enough CPU
      // to get the isolate killed (error 1101) before the first request could
      // finish. The hosted database is migrated once by `npm run db:seed`, so
      // the app only verifies the schema is present rather than changing it.
      if (!onWorkers) await runMigrations(adapter);
      return adapter;
    })();

    // This promise is cached on globalThis, so the request that triggered it may
    // be gone by the time a database connection is refused. An unhandled
    // rejection like that kills the whole isolate — Workers reports it as
    // error 1101 and no route handler's try/catch can see it. Marking the
    // promise handled here keeps the failure to whoever awaits it next, while
    // still letting that caller observe the real error.
    void pending.catch(() => {});

    g[GLOBAL_DB_KEY] = pending;
  }
  return g[GLOBAL_DB_KEY]!;
}

/** Test-only: fresh isolated in-memory adapter, never registered as the singleton. */
export async function createTestAdapter(): Promise<DbAdapter> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  const query: QueryFn = async <T = QueryResultRow>(text: string, params?: unknown[]) => {
    const res = await db.query(text, params as unknown[]);
    return {
      rows: res.rows as unknown as T[],
      rowCount: (res as unknown as { affectedRows?: number }).affectedRows ?? undefined,
    };
  };
  const transaction: DbAdapter["transaction"] = async <T>(fn: (q: QueryFn) => Promise<T>) =>
    db.transaction(async (tx) => {
      const q: QueryFn = async <U = QueryResultRow>(text: string, params?: unknown[]) => {
        const res = await tx.query(text, params as unknown[]);
        return {
          rows: res.rows as unknown as U[],
          rowCount: (res as unknown as { affectedRows?: number }).affectedRows ?? undefined,
        };
      };
      return fn(q);
    });
  const adapter: DbAdapter = {
    kind: "pglite",
    query,
    transaction,
    close: async () => {
      try {
        await db.close();
      } catch {
        /* ignore */
      }
    },
  };
  await runMigrations(adapter);
  return adapter;
}

/**
 * Split a SQL script into statements, respecting string literals, dollar-quoted
 * bodies, and line/block comments.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (two === "--") {
      const end = sql.indexOf("\n", i + 2);
      i = end === -1 ? n : end + 1;
      continue;
    }
    if (ch === "'") {
      buf += ch;
      i++;
      while (i < n) {
        const c = sql[i];
        buf += c;
        if (c === "'" && sql[i + 1] === "'") {
          buf += sql[i + 1];
          i += 2;
          continue;
        }
        i++;
        if (c === "'") break;
      }
      continue;
    }
    if (ch === "$") {
      const tagMatch = /^\$[A-Za-z_0-9]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const closeIdx = sql.indexOf(tag, i + tag.length);
        if (closeIdx === -1) {
          buf += sql.slice(i);
          i = n;
        } else {
          buf += sql.slice(i, closeIdx + tag.length);
          i = closeIdx + tag.length;
        }
        continue;
      }
    }
    if (ch === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt + ";");
      buf = "";
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) out.push(tail.endsWith(";") ? tail : tail + ";");
  return out;
}