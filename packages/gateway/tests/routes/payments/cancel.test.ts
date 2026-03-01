import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { cancelPaymentRoute } from '../../../src/routes/payments/cancel';
import { PaymentService } from '../../../src/services/payment.service';
import { MerchantService } from '../../../src/services/merchant.service';
import { ServerSigningService } from '../../../src/services/signature-server.service';
import { BlockchainService } from '../../../src/services/blockchain.service';
import { RelayerService } from '../../../src/services/relayer.service';
import { API_V1_BASE_PATH } from '../../../src/constants';

const TEST_API_KEY = 'sk_test_abc123';

const VALID_PAYMENT_ID = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const MOCK_SIGNATURE = '0x' + 'ab'.repeat(65);

const MOCK_GATEWAY_ADDRESS = '0x' + 'cc'.repeat(20);

const mockMerchant = {
  id: 1,
  merchant_key: 'merchant_demo_001',
  name: 'Demo Store',
  api_key_hash: 'hashed',
  public_key_hash: 'hashed_public',
  webhook_url: null,
  is_enabled: true,
  is_deleted: false,
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
};

const createMockPayment = (overrides = {}) => ({
  id: 1,
  payment_hash: VALID_PAYMENT_ID,
  merchant_id: 1,
  status: 'ESCROWED',
  amount: '1000000000000000000',
  network_id: 80002,
  token_address: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
  recipient_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  escrow_deadline: new Date(Date.now() + 3600_000),
  ...overrides,
});

describe('POST /payments/:id/cancel', () => {
  let app: FastifyInstance;
  let paymentService: Partial<PaymentService>;
  let merchantService: Partial<MerchantService>;
  let blockchainService: Partial<BlockchainService>;
  let signingService: Partial<ServerSigningService>;
  let signingServices: Map<number, ServerSigningService>;
  let relayerService: Partial<RelayerService>;
  let relayerServices: Map<number, RelayerService>;

  beforeEach(async () => {
    app = Fastify({
      logger: false,
      ajv: {
        customOptions: {
          keywords: ['example'],
        },
      },
    });
    await app.register(cors);

    merchantService = {
      findByApiKey: vi.fn().mockResolvedValue(mockMerchant),
    };

    paymentService = {
      findByHash: vi.fn().mockResolvedValue(createMockPayment()),
      claimForProcessing: vi.fn().mockResolvedValue(true),
      createEvent: vi.fn().mockResolvedValue(undefined),
    };

    blockchainService = {
      getChainContracts: vi.fn().mockReturnValue({
        gateway: MOCK_GATEWAY_ADDRESS,
        forwarder: '0x' + 'dd'.repeat(20),
      }),
    };

    signingService = {
      signCancelRequest: vi.fn().mockResolvedValue(MOCK_SIGNATURE),
    };

    signingServices = new Map();
    signingServices.set(80002, signingService as ServerSigningService);

    relayerService = {
      submitDirectTransaction: vi.fn().mockResolvedValue({
        relayRequestId: 'relay-123',
        transactionHash: '0x' + 'f'.repeat(64),
        status: 'pending',
      }),
    };

    relayerServices = new Map();
    relayerServices.set(80002, relayerService as RelayerService);

    await app.register(
      async (scope) => {
        await cancelPaymentRoute(
          scope,
          merchantService as MerchantService,
          paymentService as PaymentService,
          blockchainService as BlockchainService,
          signingServices,
          relayerServices
        );
      },
      { prefix: API_V1_BASE_PATH }
    );
  });

  describe('Success cases', () => {
    it('should return 200 with signature for valid ESCROWED payment', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.paymentId).toBe(VALID_PAYMENT_ID);
      expect(body.data.relayRequestId).toBe('relay-123');
      expect(body.data.transactionHash).toBe('0x' + 'f'.repeat(64));
      expect(body.data.status).toBe('pending');
    });

    it('should call claimForProcessing with correct args', async () => {
      await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(paymentService.claimForProcessing).toHaveBeenCalledWith(
        1,
        'ESCROWED',
        'CANCEL_SUBMITTED'
      );
    });

    it('should create CANCEL_SUBMITTED event', async () => {
      await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(paymentService.createEvent).toHaveBeenCalledWith(1, 'CANCEL_SUBMITTED');
    });
  });

  describe('Error cases', () => {
    it('should return 404 when payment is not found', async () => {
      paymentService.findByHash = vi.fn().mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('PAYMENT_NOT_FOUND');
    });

    it('should return 403 when payment belongs to different merchant', async () => {
      paymentService.findByHash = vi
        .fn()
        .mockResolvedValue(createMockPayment({ merchant_id: 999 }));

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should return 400 when payment is not in ESCROWED status', async () => {
      paymentService.findByHash = vi
        .fn()
        .mockResolvedValue(createMockPayment({ status: 'CREATED' }));

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_STATUS');
    });

    it('should return 400 when payment is CONFIRMED', async () => {
      paymentService.findByHash = vi
        .fn()
        .mockResolvedValue(createMockPayment({ status: 'CONFIRMED' }));

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INVALID_STATUS');
    });

    it('should return 400 for invalid paymentId format (not bytes32)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/not-a-bytes32/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(400);
    });

    it('should return 409 when claimForProcessing fails (race condition)', async () => {
      paymentService.claimForProcessing = vi.fn().mockResolvedValue(false);

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(409);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CONFLICT');
    });

    it('should return 500 when signing service throws', async () => {
      signingService.signCancelRequest = vi.fn().mockRejectedValue(new Error('Signing failed'));

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': TEST_API_KEY },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('should return 401 when x-api-key header is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 when API key is invalid', async () => {
      merchantService.findByApiKey = vi.fn().mockResolvedValue(null);

      const response = await app.inject({
        method: 'POST',
        url: `${API_V1_BASE_PATH}/payments/${VALID_PAYMENT_ID}/cancel`,
        headers: { 'x-api-key': 'invalid_key' },
      });

      expect(response.statusCode).toBe(401);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('UNAUTHORIZED');
    });
  });
});
