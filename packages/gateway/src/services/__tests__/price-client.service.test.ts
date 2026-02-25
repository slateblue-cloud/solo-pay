import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

vi.mock('../../lib/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

import { PriceClient } from '../price-client.service';

describe('PriceClient', () => {
  let priceClient: PriceClient;
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
    priceClient = new PriceClient('https://price-service.example.com');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('constructor', () => {
    it('should initialize with valid API URL', () => {
      expect(() => new PriceClient('https://api.example.com')).not.toThrow();
    });

    it('should throw error when API URL is empty', () => {
      expect(() => new PriceClient('')).toThrow('Price service URL is required');
    });

    it('should remove trailing slash from URL', () => {
      const client = new PriceClient('https://api.example.com/');
      expect(client['baseUrl']).toBe('https://api.example.com');
    });
  });

  describe('getTokenPrice', () => {
    it('should fetch token price successfully', async () => {
      const mockResponse = {
        data: {
          name: 'Tether USD',
          symbol: 'USDT',
          quote: {
            USD: { price: 1.0001 },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await priceClient.getTokenPrice(
        1,
        '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        'USD'
      );

      expect(result.price).toBe(1.0001);
      expect(result.symbol).toBe('USDT');
      expect(result.name).toBe('Tether USD');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://price-service.example.com/api/v1/prices/1/0xdAC17F958D2ee523a2206206994597C13D831ec7?convert=USD',
        expect.objectContaining({
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle different currencies', async () => {
      const mockResponse = {
        data: {
          name: 'USD Coin',
          symbol: 'USDC',
          quote: {
            KRW: { price: 1350.5 },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      const result = await priceClient.getTokenPrice(
        137,
        '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        'KRW'
      );

      expect(result.price).toBe(1350.5);
      expect(result.symbol).toBe('USDC');
    });

    it('should throw error on HTTP failure', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: vi.fn().mockResolvedValue({ message: 'Internal server error' }),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Internal server error'
      );
    });

    it('should throw error with default message when no error message provided', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: vi.fn().mockResolvedValue({}),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Price service HTTP 404'
      );
    });

    it('should throw error when quote is missing', async () => {
      const mockResponse = {
        data: {
          name: 'Token',
          symbol: 'TKN',
          quote: {},
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Invalid price data for USD'
      );
    });

    it('should throw error when price is zero', async () => {
      const mockResponse = {
        data: {
          name: 'Token',
          symbol: 'TKN',
          quote: {
            USD: { price: 0 },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Invalid price data for USD'
      );
    });

    it('should throw error when price is negative', async () => {
      const mockResponse = {
        data: {
          name: 'Token',
          symbol: 'TKN',
          quote: {
            USD: { price: -1 },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Invalid price data for USD'
      );
    });

    it('should throw error when price is not a number', async () => {
      const mockResponse = {
        data: {
          name: 'Token',
          symbol: 'TKN',
          quote: {
            USD: { price: 'not a number' },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Invalid price data for USD'
      );
    });

    it('should handle JSON parse error gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      });

      await expect(priceClient.getTokenPrice(1, '0xtoken', 'USD')).rejects.toThrow(
        'Price service HTTP 502'
      );
    });

    it('should encode currency parameter in URL', async () => {
      const mockResponse = {
        data: {
          name: 'Token',
          symbol: 'TKN',
          quote: {
            'USD+EUR': { price: 1.5 },
          },
        },
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponse),
      });

      await priceClient.getTokenPrice(1, '0xtoken', 'USD+EUR');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('convert=USD%2BEUR'),
        expect.any(Object)
      );
    });
  });
});
