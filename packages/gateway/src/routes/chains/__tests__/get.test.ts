import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getChainsRoute } from '../get';

const mockChainService = {
  findAll: vi.fn(),
};

const mockTokenService = {
  findAllForChains: vi.fn(),
};

describe('Chains Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    await getChainsRoute(app, mockChainService as never, mockTokenService as never);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /chains', () => {
    it('should return all chains', async () => {
      const mockChains = [
        { id: 1, network_id: 1, name: 'Ethereum Mainnet', is_testnet: false },
        { id: 2, network_id: 137, name: 'Polygon', is_testnet: false },
        { id: 3, network_id: 31337, name: 'Hardhat Local', is_testnet: true },
      ];

      mockChainService.findAll.mockResolvedValue(mockChains);

      const response = await app.inject({
        method: 'GET',
        url: '/chains',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.chains).toHaveLength(3);
      expect(body.chains[0]).toEqual({
        id: 1,
        network_id: 1,
        name: 'Ethereum Mainnet',
        is_testnet: false,
      });
    });

    it('should return empty array when no chains', async () => {
      mockChainService.findAll.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/chains',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.chains).toHaveLength(0);
    });

    it('should return 500 on service error', async () => {
      mockChainService.findAll.mockRejectedValue(new Error('Database error'));

      const response = await app.inject({
        method: 'GET',
        url: '/chains',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('INTERNAL_ERROR');
      expect(body.message).toBe('Database error');
    });
  });

  describe('GET /chains/tokens', () => {
    it('should return all chains with their tokens', async () => {
      const mockChains = [
        { id: 1, network_id: 1, name: 'Ethereum Mainnet', is_testnet: false },
        { id: 2, network_id: 137, name: 'Polygon', is_testnet: false },
      ];

      const mockTokens = [
        {
          id: 1,
          chain_id: 1,
          address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
          symbol: 'USDT',
          decimals: 6,
        },
        {
          id: 2,
          chain_id: 1,
          address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
          symbol: 'USDC',
          decimals: 6,
        },
        {
          id: 3,
          chain_id: 2,
          address: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
          symbol: 'USDC',
          decimals: 6,
        },
      ];

      mockChainService.findAll.mockResolvedValue(mockChains);
      mockTokenService.findAllForChains.mockResolvedValue(mockTokens);

      const response = await app.inject({
        method: 'GET',
        url: '/chains/tokens',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.chains).toHaveLength(2);

      const ethChain = body.chains.find((c: { network_id: number }) => c.network_id === 1);
      expect(ethChain.tokens).toHaveLength(2);
      expect(ethChain.tokens[0].symbol).toBe('USDT');

      const polyChain = body.chains.find((c: { network_id: number }) => c.network_id === 137);
      expect(polyChain.tokens).toHaveLength(1);
      expect(polyChain.tokens[0].symbol).toBe('USDC');
    });

    it('should return chains with empty tokens array when no tokens', async () => {
      const mockChains = [{ id: 1, network_id: 31337, name: 'Hardhat Local', is_testnet: true }];

      mockChainService.findAll.mockResolvedValue(mockChains);
      mockTokenService.findAllForChains.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/chains/tokens',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.chains[0].tokens).toHaveLength(0);
    });

    it('should return 500 on chainService error', async () => {
      mockChainService.findAll.mockRejectedValue(new Error('Chain service error'));

      const response = await app.inject({
        method: 'GET',
        url: '/chains/tokens',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should return 500 on tokenService error', async () => {
      mockChainService.findAll.mockResolvedValue([
        { id: 1, network_id: 1, name: 'Eth', is_testnet: false },
      ]);
      mockTokenService.findAllForChains.mockRejectedValue(new Error('Token service error'));

      const response = await app.inject({
        method: 'GET',
        url: '/chains/tokens',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should call tokenService with correct chain IDs', async () => {
      const mockChains = [
        { id: 1, network_id: 1, name: 'Ethereum', is_testnet: false },
        { id: 5, network_id: 137, name: 'Polygon', is_testnet: false },
      ];

      mockChainService.findAll.mockResolvedValue(mockChains);
      mockTokenService.findAllForChains.mockResolvedValue([]);

      await app.inject({
        method: 'GET',
        url: '/chains/tokens',
      });

      expect(mockTokenService.findAllForChains).toHaveBeenCalledWith([1, 5], false);
    });
  });
});
