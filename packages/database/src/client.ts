import { PrismaClient } from './generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

let prismaInstance: PrismaClient | undefined;

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.MYSQL_HOST || 'localhost';
  const port = process.env.MYSQL_PORT || '3306';
  const user = process.env.MYSQL_USER || 'solopay';
  const password = process.env.MYSQL_PASSWORD || '';
  const database = process.env.MYSQL_DATABASE || 'solopay';

  return `mysql://${user}:${password}@${host}:${port}/${database}`;
}

export function getPrismaClient(): PrismaClient {
  if (!prismaInstance) {
    const adapter = new PrismaMariaDb(getDatabaseUrl());
    prismaInstance = new PrismaClient({ adapter });
  }
  return prismaInstance;
}

export async function disconnectPrisma(): Promise<void> {
  if (prismaInstance) {
    await prismaInstance.$disconnect();
    prismaInstance = undefined;
  }
}
