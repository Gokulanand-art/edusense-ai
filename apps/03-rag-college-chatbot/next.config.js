/** @type {import('next').NextConfig} */

// Ensure critical environment variables exist during build phase
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    "mongodb+srv://venkatvantakula45_db_user:QtTjfBpdEvQZSPHM@chatbot.uht7czj.mongodb.net/college_rag?retryWrites=true&w=majority&appName=Chatbot";
}
if (!process.env.NEXTAUTH_SECRET) {
  process.env.NEXTAUTH_SECRET = "super-secret-production-nextauth-key-32-chars-min-12345";
}
if (!process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = "super-secret-production-nextauth-key-32-chars-min-12345";
}

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
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
