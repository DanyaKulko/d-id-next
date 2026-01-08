import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import "dotenv/config";

// declare global {
//     var prisma: PrismaClient | undefined;
// }

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = new PrismaClient({
  adapter,
});

// if (process.env.NODE_ENV !== "production") global.prisma = prisma;
