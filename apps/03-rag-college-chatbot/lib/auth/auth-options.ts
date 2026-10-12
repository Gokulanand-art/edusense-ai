import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db/prisma";

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

        // 1. Check built-in demo credentials for guaranteed zero-downtime logins
        if (email === "admin@college.edu" && (password === "Admin@123" || password === "admin123")) {
          return {
            id: "66d300000000000000000001",
            name: "College Administrator",
            email: "admin@college.edu",
            role: "ADMIN",
          };
        }

        if (email === "student@college.edu" && (password === "Student@123" || password === "student123")) {
          return {
            id: "66d300000000000000000002",
            name: "Alex Johnson",
            email: "student@college.edu",
            role: "STUDENT",
          };
        }

        // 2. Query active MongoDB database
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
  secret: process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "default-production-nextauth-secret-key-32-chars-min",
};
