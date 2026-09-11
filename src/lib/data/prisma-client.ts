/**
 * Prisma client singleton (Prisma 7 + driver adapter).
 *
 * Prisma 7 connects through a driver adapter rather than a schema `url`. We use
 * the pg adapter, which works with Neon's standard/pooled Postgres connection
 * string on Vercel's Node runtime. One instance per process; stashed on
 * globalThis so Next.js dev HMR doesn't open a new pool on every reload.
 *
 * This module is only imported when DATABASE_URL is set (see ./store), so the
 * demo path never touches pg.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const holder = globalThis as unknown as { __prisma?: PrismaClient };

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("prisma-client: DATABASE_URL is not set");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma: PrismaClient = holder.__prisma ?? create();

if (process.env.NODE_ENV !== "production") holder.__prisma = prisma;
