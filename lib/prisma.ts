import { PrismaClient } from "@prisma/client";
import path from "node:path";

declare global {
  var prisma: PrismaClient | undefined;
}

const defaultSqlitePath = path.resolve(process.cwd(), "prisma", "dev.db");
const defaultDatabaseUrl = `file:${defaultSqlitePath.replace(/\\/g, "/")}`;

export const prisma =
  globalThis.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}
