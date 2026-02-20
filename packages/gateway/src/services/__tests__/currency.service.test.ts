import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockPrisma, resetPrismaMocks } from '../../db/__mocks__/client';

vi.mock('../../db/client', () => ({
  getPrismaClient: vi.fn(() => mockPrisma),
  disconnectPrisma: vi.fn(),
}));

import { CurrencyService } from '../currency.service';

describe('CurrencyService', () => {
  let currencyService: CurrencyService;

  beforeEach(() => {
    resetPrismaMocks();
    currencyService = new CurrencyService(mockPrisma);
  });

  describe('findByCode', () => {
    it('should find currency by code', async () => {
      const mockCurrency = {
        id: 1,
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrisma.currency.findUnique.mockResolvedValue(mockCurrency);

      const result = await currencyService.findByCode('USD');

      expect(result).toBeDefined();
      expect(result?.code).toBe('USD');
      expect(result?.name).toBe('US Dollar');
      expect(mockPrisma.currency.findUnique).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should convert code to uppercase', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue(null);

      await currencyService.findByCode('usd');

      expect(mockPrisma.currency.findUnique).toHaveBeenCalledWith({
        where: { code: 'USD' },
      });
    });

    it('should return null when currency not found', async () => {
      mockPrisma.currency.findUnique.mockResolvedValue(null);

      const result = await currencyService.findByCode('INVALID');

      expect(result).toBeNull();
    });

    it('should handle mixed case input', async () => {
      const mockCurrency = {
        id: 2,
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockPrisma.currency.findUnique.mockResolvedValue(mockCurrency);

      const result = await currencyService.findByCode('EuR');

      expect(result?.code).toBe('EUR');
      expect(mockPrisma.currency.findUnique).toHaveBeenCalledWith({
        where: { code: 'EUR' },
      });
    });

    it('should find various currency codes', async () => {
      const currencies = [
        { code: 'KRW', name: 'Korean Won', symbol: '₩' },
        { code: 'JPY', name: 'Japanese Yen', symbol: '¥' },
        { code: 'GBP', name: 'British Pound', symbol: '£' },
      ];

      for (const currency of currencies) {
        const mockCurrency = {
          id: 1,
          ...currency,
          created_at: new Date(),
          updated_at: new Date(),
        };

        mockPrisma.currency.findUnique.mockResolvedValue(mockCurrency);

        const result = await currencyService.findByCode(currency.code);

        expect(result?.code).toBe(currency.code);
        expect(result?.symbol).toBe(currency.symbol);
      }
    });
  });
});
