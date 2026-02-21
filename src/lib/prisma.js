import { PrismaClient } from "@prisma/client";

// Global singleton pattern for serverless — prevents connection exhaustion.
// On Vercel, each cold start creates a new module scope. Without this,
// every invocation creates a new PrismaClient (and new DB connections).
const globalForPrisma = globalThis;

const prisma = globalForPrisma.__prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__prisma = prisma;
}

export default prisma;
