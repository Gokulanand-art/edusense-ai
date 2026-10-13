const path = require("node:path");

const isWorkersBuild = process.env.CF_BUILD === "1";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Locally, pglite and pg are kept external so they load from node_modules
    // (pglite needs its .wasm/.data files at runtime). In the Workers build
    // pglite is dropped entirely and replaced by a stub — see below.
    serverComponentsExternalPackages: isWorkersBuild
      ? ["pg", "@neondatabase/serverless"]
      : ["@electric-sql/pglite", "pg", "@neondatabase/serverless"],
  },
  webpack(config, { isServer }) {
    // PGlite is an embedded Postgres that boots on WASM and persists to disk.
    // Workers have neither a filesystem nor the CPU budget for it: bundling it
    // added ~50MB (initdb.wasm, pglite.wasm, pglite.data) and got the isolate
    // killed on cold start with error 1101. Swap in a stub that throws so the
    // code path fails loudly if it is ever reached on Workers.
    if (isWorkersBuild && isServer) {
      config.resolve.alias["@electric-sql/pglite"] = path.resolve(
        __dirname,
        "src/lib/pglite-workers-stub.ts",
      );
    }
    return config;
  },
};
module.exports = nextConfig;
