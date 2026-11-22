// Import the Prisma adapter that talks to Postgres through the `pg` driver.
import { PrismaPg } from "@prisma/adapter-pg";

// Import the generated Prisma client class.
import { PrismaClient } from "@/generated/prisma/client";

// Reuse one client across hot reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Export the shared database client.
export const db =
  // Use the client already stored on the global object, if there is one.
  globalForPrisma.prisma ??
  // Otherwise create a new client.
  new PrismaClient({
    // Connect through the Postgres adapter, using the connection string from the environment.
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

// Outside production, remember the client on the global object so hot reloads reuse it.
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
