import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { finalizePaymentRoute } from '../finalize';
import { Decimal } from '@solo-pay/database';

const mockPaymentService = {
  findByHash: vi.fn(),
  claimForProcessing: vi.fn(),
  createEvent: vi.fn(),
};

const mockMerchantService = {};

const mockBlockchainService = {
  getChainContracts: vi.fn(),
};

const mockSigningService = {
  signFinalizeRequest: vi.fn(),
};

const mockRelayerService = {
  submitDirectTransaction: vi.fn(),
};

vi.mock('../../../middleware/auth.middleware', () => ({
  createAuthMiddleware: vi.fn(() => async (request: { merchant: unknown }) => {
    request.merchant = { id: 1, merchant_key: 'merchant_demo_001' };
  }),
}));

describe('POST /payments/:id/finalize', () => {
  let app: FastifyInstance;
  const signingServices = new Map();
  const relayerServices = new Map();

  beforeEach(async () => {
    vi.clearAllMocks();
    signingServices.clear();
    signingServices.set(31337, mockSigningService);
    relayerServices.clear();
    relayerServices.set(31337, mockRelayerService);

    app = Fastify();
    await finalizePaymentRoute(
      app,
      mockMerchantService as never,
      mockPaymentService as never,
      mockBlockchainService as never,
      signingServices as never,
      relayerServices as never
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('successful responses', () => {
    it('should return 200 with finalize data for valid escrowed payment', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      const mockPayment = {
        id: 1,
        payment_hash: paymentHash,
        merchant_id: 1,
        network_id: 31337,
        status: 'ESCROWED',
        escrow_deadline: new Date(Date.now() + 3600000),
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        finalized_at: null,
        cancelled_at: null,
      };

      const gatewayAddress = '0x' + 'b'.repeat(40);
      const serverSignature = '0x' + 'c'.repeat(130);
      const mockRelayResult = {
        relayRequestId: 'relay-123',
        transactionHash: '0x' + 'f'.repeat(64),
        status: 'pending',
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockPaymentService.claimForProcessing.mockResolvedValue(true);
      mockPaymentService.createEvent.mockResolvedValue({});
      mockBlockchainService.getChainContracts.mockReturnValue({ gateway: gatewayAddress });
      mockSigningService.signFinalizeRequest.mockResolvedValue(serverSignature);
      mockRelayerService.submitDirectTransaction.mockResolvedValue(mockRelayResult);

      const response = await app.inject({
        method: 'POST',
        url: `/payments/${paymentHash}/finalize`,
        headers: { 'x-api-key': 'test_api_key' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.paymentId).toBe(paymentHash);
      expect(body.data.relayRequestId).toBe('relay-123');
      expect(body.data.transactionHash).toBe('0x' + 'f'.repeat(64));
      expect(body.data.status).toBe('pending');
    });
  });

  describe('error responses', () => {
    it('should return 404 when payment not found', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      mockPaymentService.findByHash.mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `/payments/${paymentHash}/finalize`,
        headers: { 'x-api-key': 'test_api_key' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('should return 403 when payment belongs to different merchant', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      const mockPayment = {
        id: 1,
        payment_hash: paymentHash,
        merchant_id: 999,
        network_id: 31337,
        status: 'ESCROWED',
        escrow_deadline: new Date(Date.now() + 3600000),
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        finalized_at: null,
        cancelled_at: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);

      const response = await app.inject({
        method: 'POST',
        url: `/payments/${paymentHash}/finalize`,
        headers: { 'x-api-key': 'test_api_key' },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should return 400 INVALID_STATUS when payment is not ESCROWED', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      const mockPayment = {
        id: 1,
        payment_hash: paymentHash,
        merchant_id: 1,
        network_id: 31337,
        status: 'CONFIRMED',
        escrow_deadline: null,
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        finalized_at: null,
        cancelled_at: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);

      const response = await app.inject({
        method: 'POST',
        url: `/payments/${paymentHash}/finalize`,
        headers: { 'x-api-key': 'test_api_key' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('INVALID_STATUS');
    });

    it('should return 400 ESCROW_EXPIRED when escrow deadline has passed', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      const mockPayment = {
        id: 1,
        payment_hash: paymentHash,
        merchant_id: 1,
        network_id: 31337,
        status: 'ESCROWED',
        escrow_deadline: new Date(Date.now() - 3600000),
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        finalized_at: null,
        cancelled_at: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);

      const response = await app.inject({
        method: 'POST',
        url: `/payments/${paymentHash}/finalize`,
        headers: { 'x-api-key': 'test_api_key' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('ESCROW_EXPIRED');
    });

    it('should return 409 CONFLICT when claimForProcessing fails', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      const mockPayment = {
        id: 1,
        payment_hash: paymentHash,
        merchant_id: 1,
        network_id: 31337,
        status: 'ESCROWED',
        escrow_deadline: new Date(Date.now() + 3600000),
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        finalized_at: null,
        cancelled_at: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockPaymentService.claimForProcessing.mockResolvedValue(false);
      mockBlockchainService.getChainContracts.mockReturnValue({ gateway: '0x' + 'b'.repeat(40) });

      const response = await app.inject({
        method: 'POST',
        url: `/payments/${paymentHash}/finalize`,
        headers: { 'x-api-key': 'test_api_key' },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('CONFLICT');
    });
  });
});
