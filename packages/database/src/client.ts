import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg"; // Import the Pool
import { PrismaClient, type Prisma } from "../generated/client";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

// 1. Create the Pool specifically for the adapter
const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
  connectionString,
});

// 2. Pass the pool to the adapter
const adapter = new PrismaPg(pool);

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    adapter,
    // Optional: Log queries to see if connection works
    // log: ['query', 'info', 'warn', 'error'],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// A pause or resume transaction can wait for Solana confirmation.
export const market_pause_transaction_options = { timeout: 120_000 };

/** Serialize hedge pause and admin resume, even before an Exposure row exists. */
export async function lock_market_for_pause(
  tx: Prisma.TransactionClient,
  market_id: string,
): Promise<void> {
  // Keep foreign-key checks for fills and exposure writes compatible with the lock.
  await tx.$queryRaw`SELECT "id" FROM "Market" WHERE "id" = ${market_id} FOR NO KEY UPDATE`;
}

export * from "../generated/client";
