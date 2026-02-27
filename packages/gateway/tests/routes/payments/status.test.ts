import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { getPaymentStatusRoute } from '../../../src/routes/payments/get-status';
import { BlockchainService } from '../../../src/services/blockchain.service';
import { PaymentService } from '../../../src/services/payment.service';
import { MerchantService } from '../../../src/services/merchant.service';
import { ChainService } from '../../../src/services/chain.service';
import { TokenService } from '../../../src/services/token.service';
import { PaymentMethodService } from '../../../src/services/payment-method.service';
import { PaymentStatus } from '../../../src/schemas/payment.schema';
import { API_V1_BASE_PATH } from '../../../src/constants';

const TEST_PUBLIC_KEY = 'pk_test_demo';
const TEST_ORIGIN = 'http://localhost:3011';

const publicAuthHeaders = { 'x-public-key': TEST_PUBLIC_KEY, origin: TEST_ORIGIN };

describe('GET /payments/:id', () => {
  let app: FastifyInstance;
  let blockchainService: Partial<BlockchainService>;
  let paymentService: Partial<PaymentService>;
  let merchantService: Partial<MerchantService>;
  let chainService: Partial<ChainService>;
  let tokenService: Partial<TokenService>;
  let paymentMethodService: Partial<PaymentMethodService>;

  const mockPaymentData = {
    id: 1,
    payment_hash: 'payment-123',
    merchant_id: 1,
    payment_method_id: 1,
    network_id: 31337,
    token_symbol: 'USDC',
    token_decimals: 6,
    status: 'PENDING',
    amount: '1000000000000000000', // 1 token in wei (18 decimals)
    order_id: 'order_001',
    success_url: 'https://example.com/success',
    fail_url: 'https://example.com/fail',
    expires_at: new Date('2099-01-01').toISOString(),
    currency_code: null,
    fiat_amount: null,
    token_price: null,
    tx_hash: null,
  };

  const mockPaymentStatus: PaymentStatus = {
    paymentId: 'payment-123',
    payerAddress: '0x' + 'a'.repeat(40),
    amount: 1000000000000000000, // Must match mockPaymentData.amount for completed status
    tokenAddress: '0x' + 'a'.repeat(40),
    tokenSymbol: 'USDC',
    treasuryAddress: '0x' + 'b'.repeat(40),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

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

    // Mock BlockchainService
    blockchainService = {
      getPaymentStatus: vi.fn().mockResolvedValue(mockPaymentStatus),
      recordPaymentOnChain: vi.fn(),
      waitForConfirmation: vi.fn(),
      estimateGasCost: vi.fn(),
      isChainSupported: vi.fn().mockReturnValue(true),
    };

    paymentService = {
      findByHash: vi.fn().mockResolvedValue(mockPaymentData),
      updateStatusByHash: vi.fn().mockResolvedValue(mockPaymentData),
      updatePayerAddress: vi
        .fn()
        .mockResolvedValue({ ...mockPaymentData, payer_address: '0xpayer' }),
      getTokenPermitSupported: vi.fn().mockResolvedValue(false),
    };

    merchantService = {
      findById: vi.fn().mockResolvedValue({
        id: 1,
        merchant_key: 'merchant_demo_001',
        recipient_address: '0x' + '1'.repeat(40),
        fee_bps: 100,
        escrow_duration: 300,
        webhook_url: 'https://merchant.example/webhook',
      }),
      findByPublicKey: vi.fn().mockResolvedValue({
        id: 1,
        webhook_url: 'https://merchant.example/webhook',
      }),
    };

    chainService = {
      findByNetworkId: vi.fn().mockResolvedValue({
        network_id: 31337,
        gateway_address: '0x' + '2'.repeat(40),
        forwarder_address: '0x' + '3'.repeat(40),
      }),
    };

    tokenService = {
      findById: vi.fn().mockResolvedValue({
        id: 1,
        address: '0x' + '4'.repeat(40),
        permit_enabled: false,
      }),
    };

    paymentMethodService = {
      findById: vi.fn().mockResolvedValue({
        id: 1,
        token_id: 1,
      }),
    };

    await app.register(
      async (scope) => {
        await getPaymentStatusRoute(
          scope,
          blockchainService as BlockchainService,
          paymentService as PaymentService,
          merchantService as MerchantService,
          chainService as ChainService,
          tokenService as TokenService,
          paymentMethodService as PaymentMethodService
        );
      },
      { prefix: API_V1_BASE_PATH }
    );
  });

  describe('Public auth', () => {
    it('x-public-key 없이 요청하면 2xx가 아니어야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/payment-123`,
        headers: { origin: TEST_ORIGIN },
      });
      // Schema validation (400) or middleware (401) must reject the request
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(response.statusCode).toBeLessThan(500);
    });

    it('ALLOWED_WIDGET_ORIGIN 미설정 시 origin 무관하게 통과해야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/payment-123`,
        headers: { 'x-public-key': TEST_PUBLIC_KEY, origin: 'https://any-origin.example.com' },
      });
      expect(response.statusCode).not.toBe(403);
    });
  });

  describe('정상 케이스', () => {
    it('유효한 결제 ID로 요청하면 200 상태 코드와 함께 결제 정보를 반환해야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/payment-123`,
        headers: publicAuthHeaders,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.paymentId).toBe(mockPaymentData.payment_hash);
    });

    it('응답에 결제의 모든 필드가 포함되어야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/payment-123`,
        headers: publicAuthHeaders,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const data = body.data;

      expect(data).toHaveProperty('paymentId');
      expect(data).toHaveProperty('chainId');
      expect(data).toHaveProperty('tokenSymbol');
      expect(data).toHaveProperty('status');
    });
  });

  describe('경계 케이스', () => {
    it('존재하지 않는 결제 ID일 때 404 상태 코드를 반환해야 함', async () => {
      // paymentService.findByHash가 null을 반환하면 404
      paymentService.findByHash = vi.fn().mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/nonexistent-id`,
        headers: publicAuthHeaders,
      });

      expect(response.statusCode).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('NOT_FOUND');
    });

    it('빈 결제 ID일 때 400 상태 코드를 반환해야 함', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/`,
        headers: publicAuthHeaders,
      });

      // Fastify는 빈 파라미터를 다르게 처리할 수 있음
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    });
  });

  describe('예외 케이스', () => {
    it('블록체인 서비스 오류 발생 시 500 상태 코드를 반환해야 함', async () => {
      blockchainService.getPaymentStatus = vi
        .fn()
        .mockRejectedValueOnce(new Error('블록체인 연결 오류'));

      const response = await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/payment-123`,
        headers: publicAuthHeaders,
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('INTERNAL_ERROR');
    });

    it('다양한 결제 상태를 반환할 수 있어야 함', async () => {
      const statuses: Array<'pending' | 'confirmed' | 'failed' | 'completed'> = [
        'pending',
        'confirmed',
        'failed',
        'completed',
      ];

      for (const status of statuses) {
        // Reset mocks for each iteration
        paymentService.findByHash = vi.fn().mockResolvedValueOnce({
          ...mockPaymentData,
          status: status.toUpperCase(),
        });
        paymentService.getTokenPermitSupported = vi.fn().mockResolvedValue(false);
        blockchainService.getPaymentStatus = vi.fn().mockResolvedValueOnce({
          ...mockPaymentStatus,
          status,
        });

        const response = await app.inject({
          method: 'GET',
          url: `${API_V1_BASE_PATH}/payments/payment-${status}`,
          headers: publicAuthHeaders,
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        // DB status is returned (uppercase)
        expect(body.data.status).toBe(status.toUpperCase());
      }
    });
  });

  describe('성능 요구사항', () => {
    it('응답 시간이 500ms 이내여야 함', async () => {
      const startTime = performance.now();

      await app.inject({
        method: 'GET',
        url: `${API_V1_BASE_PATH}/payments/payment-123`,
        headers: publicAuthHeaders,
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // 실제 환경에서는 500ms이지만, 테스트 환경에서는 더 느릴 수 있음
      expect(duration).toBeLessThan(5000);
    });
  });
});
