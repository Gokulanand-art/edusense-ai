/**
 * Stand-in for `@electric-sql/pglite` in the Cloudflare Workers build.
 *
 * PGlite is an embedded Postgres that runs on WASM and persists to a directory
 * on disk. Workers have neither a filesystem nor the CPU budget to boot it —
 * bundling it added ~50 MB (initdb.wasm, pglite.wasm, pglite.data) and got the
 * isolate killed on cold start with error 1101.
 *
 * Local development still uses the real PGlite: next.config.js only aliases to
 * this file when CF_BUILD=1, which the `cf:build` script sets.
 */
export class PGlite {
  constructor() {
    throw new Error(
      "PGlite is not available in the Cloudflare Workers build. " +
        "Set DATABASE_URL so the Neon driver is used instead.",
    );
  }
}

export default { PGlite };
