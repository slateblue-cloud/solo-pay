import { PrismaClient, Currency } from '@solo-pay/database';

export class CurrencyService {
  constructor(private prisma: PrismaClient) {}

  async findByCode(code: string): Promise<Currency | null> {
    return this.prisma.currency.findUnique({
      where: { code: code.toUpperCase() },
    });
  }
}
