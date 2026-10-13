/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pglite is a WASM Postgres; keep it external to the server bundle.
  experimental: { serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"] },
};
module.exports = nextConfig;
