/** @type {import('next').NextConfig} */

// Fail closed: required secrets must be provided via the environment (see .env.example).
if (!process.env.DATABASE_URL) {
  throw new Error("Missing required environment variable: DATABASE_URL. Set it via your environment — see .env.example.");
}
if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
  throw new Error("Missing required environment variable: NEXTAUTH_SECRET (or AUTH_SECRET). Set it via your environment — see .env.example.");
}

const nextConfig = {
  typescript: {
    ignoreBuildErrors: false,
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'mammoth', '@prisma/client', 'bcryptjs'],
  },
  webpack: (config, { isServer }) => {
    config.resolve.alias.canvas = false;
    config.resolve.alias.encoding = false;
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
