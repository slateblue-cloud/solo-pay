// Export everything from generated Prisma client
export * from './generated/prisma/client';

// Export Prisma namespace (includes Decimal as Prisma.Decimal)
export { Prisma } from './generated/prisma/client';

// Export database utilities
export { getPrismaClient, disconnectPrisma } from './client';

// Re-export Decimal for convenience (both type and value)
import { Prisma } from './generated/prisma/client';
export const Decimal = Prisma.Decimal;
export type Decimal = Prisma.Decimal;
