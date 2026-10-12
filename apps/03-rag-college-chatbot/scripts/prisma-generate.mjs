import { execSync } from "child_process";

const DEFAULT_DATABASE_URL =
  "mongodb+srv://venkatvantakula45_db_user:QtTjfBpdEvQZSPHM@chatbot.uht7czj.mongodb.net/college_rag?retryWrites=true&w=majority&appName=Chatbot";

process.env.DATABASE_URL = process.env.DATABASE_URL || DEFAULT_DATABASE_URL;

try {
  console.log("⚡ Generating Prisma Client with MongoDB schema...");
  execSync("npx prisma generate", { stdio: "inherit", env: process.env });
  console.log("✅ Prisma Client generation successful!");
} catch (err) {
  console.warn("⚠️ Notice during Prisma generation:", err?.message || err);
}
