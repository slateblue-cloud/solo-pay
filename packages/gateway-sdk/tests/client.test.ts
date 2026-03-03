import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoloPayClient, SoloPayError } from '../src/index';
import type { CreatePaymentParams, GaslessParams } from '../src/index';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('SoloPayClient', () => {
  let client: SoloPayClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = new SoloPayClient({
      environment: 'development',
      apiKey: 'test-api-key',
    });
  });

  describe('constructor', () => {
    it('TC-007.1: should initialize with development environment', () => {
      const devClient = new SoloPayClient({
        environment: 'development',
        apiKey: 'test-key',
      });
      expect(devClient.getApiUrl()).toBe('http://localhost:3001/api/v1');
    });

    it('TC-007.2: should initialize with staging environment', () => {
      const stagingClient = new SoloPayClient({
        environment: 'staging',
        apiKey: 'test-key',
      });
      expect(stagingClient.getApiUrl()).toBe('https://pay-api.staging.msq.com/api/v1');
    });

    it('TC-007.3: should initialize with production environment', () => {
      const prodClient = new SoloPayClient({
        environment: 'production',
        apiKey: 'test-key',
      });
      expect(prodClient.getApiUrl()).toBe('https://pay-api.msq.com/api/v1');
    });

    it('TC-007.4: should initialize with custom environment and apiUrl', () => {
      const customClient = new SoloPayClient({
        environment: 'custom',
        apiKey: 'test-key',
        apiUrl: 'https://custom.api.com',
      });
      expect(customClient.getApiUrl()).toBe('https://custom.api.com');
    });

    it('TC-007.5: should throw error when custom environment without apiUrl', () => {
      expect(() => {
        new SoloPayClient({
          environment: 'custom',
          apiKey: 'test-key',
        });
      }).toThrow('apiUrl is required when environment is "custom"');
    });
  });

  describe('setApiUrl and getApiUrl', () => {
    it('TC-008.1: should change API URL', () => {
      client.setApiUrl('https://new.api.com');
      expect(client.getApiUrl()).toBe('https://new.api.com');
    });

    it('TC-008.2: should return correct URL after multiple changes', () => {
      client.setApiUrl('https://api1.com');
      expect(client.getApiUrl()).toBe('https://api1.com');
      client.setApiUrl('https://api2.com');
      expect(client.getApiUrl()).toBe('https://api2.com');
    });
  });

  describe('createPayment', () => {
    const clientWithCreate = new SoloPayClient({
      environment: 'development',
      apiKey: 'test-api-key',
      publicKey: 'pk_test_demo',
      origin: 'http://localhost:3000',
    });
    const validParams: CreatePaymentParams = {
      orderId: 'order-001',
      amount: 1000,
      tokenAddress: '0x1234567890123456789012345678901234567890',
      successUrl: 'https://example.com/success',
      failUrl: 'https://example.com/fail',
    };

    it('TC-001: should create payment successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          paymentId: 'pay-123',
          orderId: 'order-001',
          serverSignature: '0x' + 'a'.repeat(130),
          chainId: 31337,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          tokenSymbol: 'TEST',
          tokenDecimals: 18,
          gatewayAddress: '0xGateway',
          forwarderAddress: '0xForwarder',
          amount: '1000',
          successUrl: validParams.successUrl,
          failUrl: validParams.failUrl,
          expiresAt: '2025-12-31T00:00:00Z',
          recipientAddress: '0xRecipient',
          merchantId: '0xMerchant',
        }),
      });

      const result = await clientWithCreate.createPayment(validParams);

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('pay-123');
      expect(result.orderId).toBe('order-001');
      expect(result.serverSignature).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/payments',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-public-key': 'pk_test_demo',
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('TC-002: should throw SoloPayError on validation failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          code: 'VALIDATION_ERROR',
          message: '입력 검증 실패',
        }),
      });

      await expect(clientWithCreate.createPayment(validParams)).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
      });
    });

    it('TC-002.1: should include error details in SoloPayError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          code: 'INVALID_REQUEST',
          message: 'Invalid request format',
          details: { field: 'amount', error: 'must be positive' },
        }),
      });

      try {
        await clientWithCreate.createPayment(validParams);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SoloPayError);
        expect((error as SoloPayError).details).toEqual({
          field: 'amount',
          error: 'must be positive',
        });
      }
    });

    it('TC-002.2: should handle INTERNAL_ERROR (500)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          code: 'INTERNAL_ERROR',
          message: '서버 내부 오류',
        }),
      });

      await expect(clientWithCreate.createPayment(validParams)).rejects.toMatchObject({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
      });
    });
  });

  describe('getPaymentStatus', () => {
    it('TC-003: should get payment status successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            paymentId: 'pay-123',
            payerAddress: '0x1234567890123456789012345678901234567890',
            amount: 1000,
            tokenAddress: '0x1234567890123456789012345678901234567890',
            tokenSymbol: 'USDC',
            treasuryAddress: '0x0987654321098765432109876543210987654321',
            status: 'completed',
            transactionHash: '0xabc123',
            blockNumber: 12345,
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:05:00Z',
            payment_hash: '0xdef456',
            network_id: 31337,
            token_symbol: 'USDC',
          },
        }),
      });

      const result = await client.getPaymentStatus('pay-123');

      expect(result.success).toBe(true);
      expect(result.data.paymentId).toBe('pay-123');
      expect(result.data.status).toBe('completed');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/payments/pay-123',
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('TC-004: should throw SoloPayError when payment not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          code: 'NOT_FOUND',
          message: '결제 정보를 찾을 수 없습니다',
        }),
      });

      await expect(client.getPaymentStatus('invalid-id')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        statusCode: 404,
      });
    });

    it('TC-003.1: should handle all payment status values', async () => {
      const statuses = ['pending', 'confirmed', 'failed', 'completed'] as const;

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            data: {
              paymentId: 'pay-123',
              payerAddress: '0x1234567890123456789012345678901234567890',
              amount: 1000,
              tokenAddress: '0x1234567890123456789012345678901234567890',
              tokenSymbol: 'USDC',
              treasuryAddress: '0x0987654321098765432109876543210987654321',
              status,
              createdAt: '2025-11-29T10:00:00Z',
              updatedAt: '2025-11-29T10:05:00Z',
              payment_hash: '0xdef456',
              network_id: 31337,
              token_symbol: 'USDC',
            },
          }),
        });

        const result = await client.getPaymentStatus('pay-123');
        expect(result.data.status).toBe(status);
      }
    });
  });

  describe('submitGasless', () => {
    const validParams: GaslessParams = {
      paymentId: 'pay-123',
      forwarderAddress: '0x1234567890123456789012345678901234567890',
      forwardRequest: {
        from: '0x1234567890123456789012345678901234567890',
        to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        value: '0',
        gas: '300000',
        nonce: '1',
        deadline: '1735689600',
        data: '0x' + 'ab'.repeat(68),
        signature: '0x' + 'a'.repeat(130),
      },
    };

    it('TC-005: should submit gasless transaction successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({
          success: true,
          status: 'submitted',
          message: 'Transaction submitted',
        }),
      });

      const result = await client.submitGasless(validParams);

      expect(result.success).toBe(true);
      expect(result.status).toBe('submitted');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/payments/pay-123/relay',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('TC-005.1: should handle gasless status values', async () => {
      const statuses = ['submitted', 'mined', 'failed'] as const;

      for (const status of statuses) {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          status: 202,
          json: async () => ({
            success: true,
            status,
            message: 'Transaction ' + status,
          }),
        });

        const result = await client.submitGasless(validParams);
        expect(result.status).toBe(status);
      }
    });

    it('TC-005.2: should use x-public-key header when publicKey is configured', async () => {
      const publicClient = new SoloPayClient({
        environment: 'development',
        apiKey: 'test-api-key',
        publicKey: 'pk_test_demo_001',
        origin: 'http://localhost:3000',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({
          success: true,
          status: 'submitted',
          message: 'Transaction submitted',
        }),
      });

      await publicClient.submitGasless(validParams);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-public-key': 'pk_test_demo_001',
            origin: 'http://localhost:3000',
          }),
        })
      );
      // Should NOT include x-api-key when using public auth
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('x-api-key');
    });

    it('TC-005.3: should use x-public-key without origin when origin is not configured', async () => {
      const publicClientNoOrigin = new SoloPayClient({
        environment: 'development',
        apiKey: 'test-api-key',
        publicKey: 'pk_test_demo_001',
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({
          success: true,
          status: 'submitted',
          message: 'Transaction submitted',
        }),
      });

      await publicClientNoOrigin.submitGasless(validParams);

      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders['x-public-key']).toBe('pk_test_demo_001');
      expect(callHeaders).not.toHaveProperty('origin');
      expect(callHeaders).not.toHaveProperty('x-api-key');
    });

    it('TC-005.4: should throw SoloPayError on invalid signature', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          code: 'INVALID_SIGNATURE',
          message: '잘못된 서명 형식',
        }),
      });

      await expect(client.submitGasless(validParams)).rejects.toMatchObject({
        code: 'INVALID_SIGNATURE',
        statusCode: 400,
      });
    });
  });

  describe('getRelayStatus', () => {
    it('should get relay status successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            status: 'FINALIZED',
            transactionHash: '0xabc123',
            errorMessage: null,
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:05:00Z',
          },
        }),
      });

      const result = await client.getRelayStatus('pay-123');

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('FINALIZED');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/payments/pay-123/relay',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('merchant endpoints', () => {
    it('should get merchant info', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          merchant: { id: 1, name: 'Test', merchant_key: 'mk_test' },
          chainTokens: [],
        }),
      });

      const result = await client.getMerchantInfo();
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant',
        expect.objectContaining({
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });

    it('should get payment methods', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          payment_methods: [
            {
              id: 1,
              is_enabled: true,
              created_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
              token: { id: 1, address: '0xtoken', symbol: 'USDC', decimals: 6 },
              chain: { id: 1, network_id: 31337, name: 'Hardhat', is_testnet: true },
            },
          ],
        }),
      });

      const result = await client.getPaymentMethods();
      expect(result.success).toBe(true);
      expect(result.payment_methods).toHaveLength(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant/payment-methods',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });

    it('should create payment method', async () => {
      const paymentMethod = {
        id: 2,
        is_enabled: true,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        token: { id: 1, address: '0xtoken', symbol: 'USDC', decimals: 6 },
        chain: { id: 1, network_id: 31337, name: 'Hardhat', is_testnet: true },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          payment_method: paymentMethod,
        }),
      });

      const result = await client.createPaymentMethod({
        tokenAddress: '0xtoken',
        is_enabled: true,
      });
      expect(result.success).toBe(true);
      expect(result.payment_method.id).toBe(2);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant/payment-methods',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });

    it('should update payment method', async () => {
      const paymentMethod = {
        id: 1,
        is_enabled: false,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        token: { id: 1, address: '0xtoken', symbol: 'USDC', decimals: 6 },
        chain: { id: 1, network_id: 31337, name: 'Hardhat', is_testnet: true },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          payment_method: paymentMethod,
        }),
      });

      const result = await client.updatePaymentMethod(1, { is_enabled: false });
      expect(result.success).toBe(true);
      expect(result.payment_method.is_enabled).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant/payment-methods/1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });

    it('should delete payment method', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          message: 'Payment method deleted',
        }),
      });

      const result = await client.deletePaymentMethod(1);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment method deleted');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant/payment-methods/1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });

    it('should get merchant payment by orderId', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          paymentId: '0xabc',
          orderId: 'order-1',
          status: 'FINALIZED',
          amount: '1000',
          tokenSymbol: 'TEST',
          tokenDecimals: 18,
          createdAt: '2025-01-01T00:00:00Z',
          expiresAt: '2025-01-01T00:30:00Z',
        }),
      });

      const result = await client.getMerchantPaymentByOrderId('order-1');
      expect(result.status).toBe('FINALIZED');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant/payments?orderId=order-1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should get merchant payment by id', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          paymentId: '0xpay123',
          orderId: 'order-5',
          status: 'PENDING',
          amount: '500',
          tokenSymbol: 'USDC',
          tokenDecimals: 6,
          createdAt: '2025-01-01T00:00:00Z',
          expiresAt: '2025-01-01T00:30:00Z',
        }),
      });

      const result = await client.getMerchantPaymentById('0xpay123');
      expect(result.paymentId).toBe('0xpay123');
      expect(result.status).toBe('PENDING');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/merchant/payments/0xpay123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });
  });

  describe('refund endpoints', () => {
    it('should create refund', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: {
            refundId: '0xrefund',
            paymentId: '0xpayment',
            amount: '1000',
            tokenAddress: '0xtoken',
            payerAddress: '0xpayer',
            status: 'PENDING',
            serverSignature: '0xsig',
            merchantId: '0xmerchant',
            createdAt: '2025-01-01T00:00:00Z',
          },
        }),
      });

      const result = await client.createRefund({ paymentId: '0xpayment' });
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/refunds',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('should get refund status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            refundId: '0xrefund123',
            paymentId: '0xpayment456',
            amount: '500',
            tokenAddress: '0xtoken',
            tokenSymbol: 'USDC',
            tokenDecimals: 6,
            payerAddress: '0xpayer',
            status: 'CONFIRMED',
            reason: 'Customer request',
            txHash: '0xtx789',
            errorMessage: null,
            createdAt: '2025-01-01T00:00:00Z',
            submittedAt: '2025-01-01T00:01:00Z',
            confirmedAt: '2025-01-01T00:02:00Z',
          },
        }),
      });

      const result = await client.getRefundStatus('0xrefund123');
      expect(result.success).toBe(true);
      expect(result.data.refundId).toBe('0xrefund123');
      expect(result.data.status).toBe('CONFIRMED');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/refunds/0xrefund123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({ 'x-api-key': 'test-api-key' }),
        })
      );
    });

    it('should get refund list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
        }),
      });

      const result = await client.getRefundList({ page: 1, limit: 10 });
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/refunds?page=1&limit=10',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should get refund list with status and paymentId filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
        }),
      });

      const result = await client.getRefundList({
        status: 'PENDING',
        paymentId: '0xpay1',
      });
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/refunds?status=PENDING&paymentId=0xpay1',
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should get refund list without params', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: { items: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } },
        }),
      });

      const result = await client.getRefundList();
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/refunds',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('chain endpoints', () => {
    it('should get chains without auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          chains: [{ id: 1, network_id: 31337, name: 'Hardhat', is_testnet: true }],
        }),
      });

      const result = await client.getChains();
      expect(result.success).toBe(true);
      // Should NOT include x-api-key or x-public-key
      const callHeaders = mockFetch.mock.calls[0][1].headers;
      expect(callHeaders).not.toHaveProperty('x-api-key');
      expect(callHeaders).not.toHaveProperty('x-public-key');
    });

    it('should get chains with tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          chains: [{ id: 1, network_id: 31337, name: 'Hardhat', is_testnet: true, tokens: [] }],
        }),
      });

      const result = await client.getChainsWithTokens();
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/chains/tokens',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('API Key header', () => {
    it('should include x-api-key header in api-auth requests', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            paymentId: 'pay-123',
            payerAddress: '0x1234567890123456789012345678901234567890',
            amount: 1000,
            tokenAddress: '0x1234567890123456789012345678901234567890',
            tokenSymbol: 'USDC',
            treasuryAddress: '0x0987654321098765432109876543210987654321',
            status: 'pending',
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:00:00Z',
            payment_hash: '0xdef456',
            network_id: 31337,
            token_symbol: 'USDC',
          },
        }),
      });

      // getPaymentStatus uses 'public' auth — when no publicKey, falls through to api-key
      await client.getPaymentStatus('pay-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-api-key': 'test-api-key',
          }),
        })
      );
    });
  });

  describe('createPayment without publicKey', () => {
    it('should throw error when publicKey is missing', async () => {
      const clientNoPublicKey = new SoloPayClient({
        environment: 'development',
        apiKey: 'test-api-key',
      });
      const params: CreatePaymentParams = {
        orderId: 'order-1',
        amount: 100,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        successUrl: 'https://example.com/success',
        failUrl: 'https://example.com/fail',
      };

      await expect(clientNoPublicKey.createPayment(params)).rejects.toThrow(
        'requestWithPublicKey requires publicKey in SoloPayConfig'
      );
    });

    it('should succeed when origin is not provided (origin is optional)', async () => {
      const clientNoOrigin = new SoloPayClient({
        environment: 'development',
        apiKey: 'test-api-key',
        publicKey: 'pk_test_demo',
      });
      const params: CreatePaymentParams = {
        orderId: 'order-1',
        amount: 100,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        successUrl: 'https://example.com/success',
        failUrl: 'https://example.com/fail',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, paymentId: '0x123' }),
      });
      const result = await clientNoOrigin.createPayment(params);
      expect(result.paymentId).toBe('0x123');
    });
  });

  describe('Error handling', () => {
    const clientWithCreate = new SoloPayClient({
      environment: 'development',
      apiKey: 'test-api-key',
      publicKey: 'pk_test_demo',
      origin: 'http://localhost:3000',
    });
    const createParams: CreatePaymentParams = {
      orderId: 'order-1',
      amount: 100,
      tokenAddress: '0x1234567890123456789012345678901234567890',
      successUrl: 'https://example.com/success',
      failUrl: 'https://example.com/fail',
    };

    it('should preserve error message', async () => {
      const errorMessage = 'Custom error message';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          code: 'VALIDATION_ERROR',
          message: errorMessage,
        }),
      });

      try {
        await clientWithCreate.createPayment(createParams);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SoloPayError).message).toBe(errorMessage);
      }
    });

    it('should handle fetch errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(clientWithCreate.createPayment(createParams)).rejects.toThrow('Network error');
    });
  });

  describe('Request payload', () => {
    it('should send correct payload for createPayment', async () => {
      const clientWithCreate = new SoloPayClient({
        environment: 'development',
        apiKey: 'test-api-key',
        publicKey: 'pk_test_demo',
        origin: 'http://localhost:3000',
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          paymentId: 'pay-123',
          orderId: 'order-1',
          serverSignature: '0x' + 'a'.repeat(130),
          chainId: 31337,
          tokenAddress: '0x1234567890123456789012345678901234567890',
          tokenSymbol: 'TEST',
          tokenDecimals: 18,
          gatewayAddress: '0xGateway',
          forwarderAddress: '0xForwarder',
          amount: '1000',
          successUrl: 'https://example.com/success',
          failUrl: 'https://example.com/fail',
          expiresAt: '2025-12-31T00:00:00Z',
          recipientAddress: '0xRecipient',
          merchantId: '0xMerchant',
        }),
      });

      const params: CreatePaymentParams = {
        orderId: 'order-1',
        amount: 1000,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        successUrl: 'https://example.com/success',
        failUrl: 'https://example.com/fail',
      };

      await clientWithCreate.createPayment(params);

      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body as string);

      expect(body).toEqual(params);
    });

    it('should send correct URL path for getPaymentStatus', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: {
            paymentId: 'pay-123',
            payerAddress: '0x1234567890123456789012345678901234567890',
            amount: 1000,
            tokenAddress: '0x1234567890123456789012345678901234567890',
            tokenSymbol: 'USDC',
            treasuryAddress: '0x0987654321098765432109876543210987654321',
            status: 'pending',
            createdAt: '2025-11-29T10:00:00Z',
            updatedAt: '2025-11-29T10:00:00Z',
            payment_hash: '0xdef456',
            network_id: 31337,
            token_symbol: 'USDC',
          },
        }),
      });

      await client.getPaymentStatus('pay-456');

      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain('/payments/pay-456');
    });
  });
});
