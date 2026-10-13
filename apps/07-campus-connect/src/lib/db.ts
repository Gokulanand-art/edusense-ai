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

async function createPgAdapter(): Promise<DbAdapter> {
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 8,
    connectionTimeoutMillis: 8000,
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
      let client: import("pg").PoolClient | undefined;
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
    g[GLOBAL_DB_KEY] = (async () => {
      const adapter = process.env.DATABASE_URL
        ? await createPgAdapter()
        : await createPgliteAdapter();
      await runMigrations(adapter);
      return adapter;
    })();
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