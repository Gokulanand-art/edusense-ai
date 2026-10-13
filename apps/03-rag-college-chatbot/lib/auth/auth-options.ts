import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

if (!process.env.NEXTAUTH_SECRET && !process.env.AUTH_SECRET) {
  throw new Error(
    "Missing required environment variable: NEXTAUTH_SECRET (or AUTH_SECRET). Set it via your environment — see .env.example."
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email", placeholder: "student@college.edu" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("Please enter an email and password");
        }

        const email = credentials.email.toLowerCase().trim();
        const password = credentials.password;

        // Authenticate against the database only. The demo users
        // (admin@college.edu, student@college.edu) are seeded into the DB
        // with bcrypt password hashes via scripts/seed.ts.
        try {
          const user = await prisma.user.findUnique({
            where: { email },
          });

          if (user) {
            const isPasswordMatch = await bcrypt.compare(password, user.passwordHash);
            if (isPasswordMatch) {
              return {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
              };
            }
          }
        } catch (dbErr) {
          console.warn("Database lookup failed during authentication:", (dbErr as any)?.message);
        }

        throw new Error("Invalid email or password");
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id as string;
        (session.user as any).role = token.role as string;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET,
};
