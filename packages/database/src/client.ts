import { PrismaClient } from './generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

let prismaInstance: PrismaClient | undefined;

/** Prisma MariaDB adapter expects scheme mariadb:// (not mysql://) */
function getDatabaseUrl(): string {
  let url: string;
  if (process.env.DATABASE_URL) {
    url = process.env.DATABASE_URL;
  } else {
    const host = process.env.MYSQL_HOST || 'localhost';
    const port = process.env.MYSQL_PORT || '3306';
    const user = process.env.MYSQL_USER || 'solopay';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || 'solopay';
    url = `mysql://${user}:${password}@${host}:${port}/${database}`;
  }
  return url.replace(/^mysql:\/\//i, 'mariadb://');
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
