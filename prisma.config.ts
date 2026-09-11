import path from "node:path";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7 config. Connection URL lives here (not in schema.prisma). The
 * PrismaClient itself connects via a driver adapter (see src/lib/data/
 * prisma-client.ts); this block is what the CLI uses for db push / migrate /
 * seed. Set DATABASE_URL to your Neon connection string.
 */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  datasource: {
    // Optional so offline `prisma generate` works with no DB configured.
    // db push / migrate / seed require this to be set (to your Neon URL).
    url: process.env.DATABASE_URL,
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
