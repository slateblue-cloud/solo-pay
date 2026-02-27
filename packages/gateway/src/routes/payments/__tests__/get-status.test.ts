import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import { getPaymentStatusRoute } from '../get-status';
import { Decimal } from '@solo-pay/database';

const mockPaymentService = {
  findByHash: vi.fn(),
  updateStatusByHash: vi.fn(),
  updatePayerAddress: vi.fn(),
  getTokenPermitSupported: vi.fn().mockResolvedValue(false),
};

const mockBlockchainService = {
  isChainSupported: vi.fn(),
  getPaymentStatus: vi.fn(),
};

const mockMerchantService = {
  findByPublicKey: vi.fn(),
  findById: vi.fn(),
};

const mockChainService = {
  findByNetworkId: vi.fn(),
};

const mockTokenService = {
  findById: vi.fn(),
};

const mockPaymentMethodService = {
  findById: vi.fn(),
};

vi.mock('../../../middleware/public-auth.middleware', () => ({
  createPublicAuthMiddleware: vi.fn(() => async (request: { merchant: unknown }) => {
    request.merchant = { id: 1, merchant_key: 'merchant_demo_001' };
  }),
}));

describe('GET /payments/:id', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    // Default mocks for details enrichment (merchant/chain/token lookups)
    mockMerchantService.findById.mockResolvedValue({
      id: 1,
      merchant_key: 'merchant_demo_001',
      recipient_address: '0x' + '1'.repeat(40),
      fee_bps: 100,
      escrow_duration: 300,
    });
    mockChainService.findByNetworkId.mockResolvedValue({
      network_id: 31337,
      gateway_address: '0x' + '2'.repeat(40),
      forwarder_address: '0x' + '3'.repeat(40),
    });
    mockPaymentMethodService.findById.mockResolvedValue({
      id: 1,
      token_id: 1,
    });
    mockTokenService.findById.mockResolvedValue({
      id: 1,
      address: '0x' + '4'.repeat(40),
      permit_enabled: false,
    });

    await getPaymentStatusRoute(
      app,
      mockBlockchainService as never,
      mockPaymentService as never,
      mockMerchantService as never,
      mockChainService as never,
      mockTokenService as never,
      mockPaymentMethodService as never
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('successful responses', () => {
    it('should return payment status for valid payment', async () => {
      const paymentHash = '0x' + 'a'.repeat(64);
      const mockPayment = {
        id: 1,
        payment_hash: paymentHash,
        merchant_id: 1,
        payment_method_id: 1,
        network_id: 31337,
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        status: 'CREATED',
        order_id: 'order_001',
        success_url: 'https://example.com/success',
        fail_url: 'https://example.com/fail',
        expires_at: new Date('2099-01-01').toISOString(),
        currency_code: 'USD',
        fiat_amount: null,
        token_price: null,
        tx_hash: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockBlockchainService.isChainSupported.mockReturnValue(true);
      mockBlockchainService.getPaymentStatus.mockResolvedValue({
        status: 'pending',
        transactionHash: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/payments/${paymentHash}`,
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.success).toBe(true);
      expect(body.data.payment_hash).toBe(paymentHash);
      expect(body.data.status).toBe('CREATED');
      // Details fields should be present
      expect(body.data.orderId).toBe('order_001');
      expect(body.data.gatewayAddress).toBe('0x' + '2'.repeat(40));
      expect(body.data.tokenAddress).toBe('0x' + '4'.repeat(40));
      expect(body.data.amount).toBe('1000000');
      expect(body.data.recipientAddress).toBe('0x' + '1'.repeat(40));
      expect(body.data.feeBps).toBe(100);
      expect(body.data.serverSignature).toBeDefined();
    });

    it('should return tokenPermitSupported in response', async () => {
      const paymentHash = '0x' + 'z'.repeat(64);
      const mockPayment = {
        id: 10,
        payment_hash: paymentHash,
        merchant_id: 1,
        payment_method_id: 5,
        network_id: 31337,
        token_symbol: 'USDC',
        token_decimals: 6,
        amount: new Decimal('1000000'),
        status: 'CREATED',
        order_id: null,
        success_url: null,
        fail_url: null,
        expires_at: new Date('2099-01-01').toISOString(),
        currency_code: null,
        fiat_amount: null,
        token_price: null,
        tx_hash: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockPaymentService.getTokenPermitSupported.mockResolvedValue(true);
      mockBlockchainService.isChainSupported.mockReturnValue(true);
      mockBlockchainService.getPaymentStatus.mockResolvedValue({
        status: 'pending',
        transactionHash: null,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/payments/${paymentHash}`,
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.tokenPermitSupported).toBe(true);
      expect(mockPaymentService.getTokenPermitSupported).toHaveBeenCalledWith(5);
    });

    it('should update status to ESCROWED when on-chain status is escrowed', async () => {
      const paymentHash = '0x' + 'b'.repeat(64);
      const txHash = '0x' + 'c'.repeat(64);
      const mockPayment = {
        id: 2,
        payment_hash: paymentHash,
        merchant_id: 1,
        payment_method_id: 1,
        network_id: 31337,
        token_symbol: 'USDT',
        token_decimals: 6,
        amount: new Decimal('2000000'),
        status: 'CREATED',
        order_id: null,
        success_url: null,
        fail_url: null,
        expires_at: new Date('2099-01-01').toISOString(),
        currency_code: null,
        fiat_amount: null,
        token_price: null,
        tx_hash: null,
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockBlockchainService.isChainSupported.mockReturnValue(true);
      mockBlockchainService.getPaymentStatus.mockResolvedValue({
        status: 'escrowed',
        transactionHash: txHash,
        amount: '2000000',
        payerAddress: '0x' + 'd'.repeat(40),
      });
      mockPaymentService.updateStatusByHash.mockResolvedValue({});
      mockPaymentService.updatePayerAddress.mockResolvedValue({});

      const response = await app.inject({
        method: 'GET',
        url: `/payments/${paymentHash}`,
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.data.status).toBe('ESCROWED');
      expect(mockPaymentService.updateStatusByHash).toHaveBeenCalledWith(
        paymentHash,
        'ESCROWED',
        txHash
      );
      expect(mockPaymentService.updatePayerAddress).toHaveBeenCalled();
    });
  });

  describe('error responses', () => {
    it('should return 404 when payment not found', async () => {
      mockPaymentService.findByHash.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/payments/0x' + 'f'.repeat(64),
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('should return 400 for unsupported chain', async () => {
      const mockPayment = {
        id: 3,
        payment_hash: '0x' + 'e'.repeat(64),
        merchant_id: 1,
        payment_method_id: 1,
        network_id: 99999,
        token_symbol: 'USDC',
        amount: new Decimal('1000000'),
        status: 'CREATED',
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockBlockchainService.isChainSupported.mockReturnValue(false);

      const response = await app.inject({
        method: 'GET',
        url: '/payments/0x' + 'e'.repeat(64),
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('UNSUPPORTED_CHAIN');
    });

    it('should return 404 when blockchain payment status not found', async () => {
      const mockPayment = {
        id: 4,
        payment_hash: '0x' + 'g'.repeat(64),
        merchant_id: 1,
        payment_method_id: 1,
        network_id: 31337,
        token_symbol: 'USDC',
        amount: new Decimal('1000000'),
        status: 'CREATED',
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockBlockchainService.isChainSupported.mockReturnValue(true);
      mockBlockchainService.getPaymentStatus.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/payments/0x' + 'g'.repeat(64),
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('should return 400 for amount mismatch', async () => {
      const mockPayment = {
        id: 5,
        payment_hash: '0x' + 'h'.repeat(64),
        merchant_id: 1,
        payment_method_id: 1,
        network_id: 31337,
        token_symbol: 'USDC',
        amount: new Decimal('1000000'),
        status: 'CREATED',
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);
      mockBlockchainService.isChainSupported.mockReturnValue(true);
      mockBlockchainService.getPaymentStatus.mockResolvedValue({
        status: 'escrowed',
        amount: '2000000',
        transactionHash: '0x' + 'i'.repeat(64),
      });

      const response = await app.inject({
        method: 'GET',
        url: '/payments/0x' + 'h'.repeat(64),
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('AMOUNT_MISMATCH');
    });

    it('should return 500 on internal error', async () => {
      mockPaymentService.findByHash.mockRejectedValue(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/payments/0x' + 'j'.repeat(64),
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('INTERNAL_ERROR');
    });
  });

  describe('merchant authorization', () => {
    it('should return 403 when payment belongs to different merchant', async () => {
      const mockPayment = {
        id: 6,
        payment_hash: '0x' + 'k'.repeat(64),
        merchant_id: 999,
        payment_method_id: 1,
        network_id: 31337,
        token_symbol: 'USDC',
        amount: new Decimal('1000000'),
        status: 'CREATED',
      };

      mockPaymentService.findByHash.mockResolvedValue(mockPayment);

      const response = await app.inject({
        method: 'GET',
        url: '/payments/0x' + 'k'.repeat(64),
        headers: { 'x-public-key': 'pk_test_123' },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.code).toBe('FORBIDDEN');
    });
  });
});
