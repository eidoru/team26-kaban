import { PrismaClient } from "@prisma/client";
import { recordDbQuery } from "./timing.js";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

function createClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  // Times every query (including inside transactions) for the Server-Timing header. The extension
  // doesn't change the client's API, so it keeps the plain PrismaClient type for existing callers.
  return base.$extends({
    query: {
      async $allOperations({ args, query }) {
        const started = performance.now();
        try {
          return await query(args);
        } finally {
          recordDbQuery(performance.now() - started);
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Interactive transactions (round close, activation) can run many queries against remote Postgres. */
export const prismaTransactionOptions = {
  maxWait: 15_000,
  timeout: 60_000,
};
