import { describe, it, expect, beforeAll } from 'vitest';
import { createTestClient, TEST_MERCHANT } from '../helpers/sdk';
import { getToken } from '../fixtures/token';
import type { CreatePaymentParams, CreatePaymentResponse } from '@solo-pay/gateway-sdk';

/**
 * Currency Conversion Integration Tests
 *
 * Tests the fiat-to-token conversion flow when `currency` is provided
 * in the payment creation request. Requires:
 *   - Gateway API running (port 3001)
 *   - Price service running (port 3003)
 */

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
const PRICE_SERVICE_URL = process.env.PRICE_SERVICE_URL || 'http://localhost:3003';
const DEFAULT_TOKEN_ADDRESS = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';

describe('Currency Conversion', () => {
  const token = getToken('test');
  let gatewayReady = false;
  let priceServiceReady = false;

  async function checkGateway(): Promise<boolean> {
    try {
      const res = await fetch(`${GATEWAY_BASE}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function checkPriceService(): Promise<boolean> {
    try {
      const res = await fetch(`${PRICE_SERVICE_URL}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  beforeAll(async () => {
    try {
      const [gwOk, psOk] = await Promise.all([checkGateway(), checkPriceService()]);
      gatewayReady = gwOk;
      priceServiceReady = psOk;

      if (!gwOk) {
        console.warn('[currency-conversion] Gateway not running, tests will be skipped');
      }
      if (!psOk) {
        console.warn(
          '[currency-conversion] Price service not running, currency tests will be skipped'
        );
      }
    } catch (err) {
      console.warn('[currency-conversion] Setup failed:', err);
    }
  });

  describe('Payment creation with fiat currency', () => {
    it('should create payment with currency: USD and return conversion fields', async () => {
      if (!gatewayReady || !priceServiceReady) return;

      const client = createTestClient(TEST_MERCHANT);
      const orderId = `CURRENCY_USD_${Date.now()}`;

      const params: CreatePaymentParams = {
        orderId,
        amount: 10, // 10 USD
        tokenAddress: DEFAULT_TOKEN_ADDRESS,
        successUrl: 'http://localhost:3000/success',
        failUrl: 'http://localhost:3000/fail',
        currency: 'USD',
      };

      const response = await client.createPayment(params);

      // Verify conversion fields are present
      expect(response.currency).toBe('USD');
      expect(response.fiatAmount).toBe(10);
      expect(response.tokenPrice).toBeDefined();
      expect(response.tokenPrice).toBeGreaterThan(0);

      // Verify amount is in wei and non-zero
      expect(response.amount).toBeDefined();
      expect(BigInt(response.amount)).toBeGreaterThan(0n);

      // Verify standard fields still present
      expect(response.paymentId).toBeDefined();
      expect(response.serverSignature).toBeDefined();
      expect(response.chainId).toBeDefined();
      expect(response.tokenAddress.toLowerCase()).toBe(DEFAULT_TOKEN_ADDRESS.toLowerCase());
    });

    it('should create payment with currency: KRW and return conversion fields', async () => {
      if (!gatewayReady || !priceServiceReady) return;

      const client = createTestClient(TEST_MERCHANT);
      const orderId = `CURRENCY_KRW_${Date.now()}`;

      const params: CreatePaymentParams = {
        orderId,
        amount: 10000, // 10000 KRW
        tokenAddress: DEFAULT_TOKEN_ADDRESS,
        successUrl: 'http://localhost:3000/success',
        failUrl: 'http://localhost:3000/fail',
        currency: 'KRW',
      };

      const response = await client.createPayment(params);

      expect(response.currency).toBe('KRW');
      expect(response.fiatAmount).toBe(10000);
      expect(response.tokenPrice).toBeDefined();
      expect(response.tokenPrice).toBeGreaterThan(0);
      expect(BigInt(response.amount)).toBeGreaterThan(0n);
    });

    it('should verify conversion math: fiatAmount / tokenPrice ≈ token amount', async () => {
      if (!gatewayReady || !priceServiceReady) return;

      const client = createTestClient(TEST_MERCHANT);
      const orderId = `CURRENCY_MATH_${Date.now()}`;

      const params: CreatePaymentParams = {
        orderId,
        amount: 100,
        tokenAddress: DEFAULT_TOKEN_ADDRESS,
        successUrl: 'http://localhost:3000/success',
        failUrl: 'http://localhost:3000/fail',
        currency: 'USD',
      };

      const response = await client.createPayment(params);
      const fiatAmount = response.fiatAmount!;
      const tokenPrice = response.tokenPrice!;
      const amountInWei = BigInt(response.amount);
      const decimals = response.tokenDecimals;

      // Expected token amount = fiatAmount / tokenPrice
      const expectedTokenAmount = fiatAmount / tokenPrice;
      // Convert wei to token units for comparison
      const actualTokenAmount = Number(amountInWei) / 10 ** decimals;

      // Allow small floating-point tolerance (0.1%)
      const tolerance = expectedTokenAmount * 0.001;
      expect(Math.abs(actualTokenAmount - expectedTokenAmount)).toBeLessThan(
        Math.max(tolerance, 1e-10)
      );
    });
  });

  describe('Payment creation without currency (backwards compatibility)', () => {
    it('should not include currency fields when currency is omitted', async () => {
      if (!gatewayReady) return;

      const client = createTestClient(TEST_MERCHANT);
      const orderId = `NO_CURRENCY_${Date.now()}`;

      const params: CreatePaymentParams = {
        orderId,
        amount: 50,
        tokenAddress: DEFAULT_TOKEN_ADDRESS,
        successUrl: 'http://localhost:3000/success',
        failUrl: 'http://localhost:3000/fail',
        // No currency field
      };

      const response = await client.createPayment(params);

      // Currency fields should be absent
      expect(response.currency).toBeUndefined();
      expect(response.fiatAmount).toBeUndefined();
      expect(response.tokenPrice).toBeUndefined();

      // Amount should be the direct token amount in wei
      const expectedWei = BigInt(50) * BigInt(10 ** token.decimals);
      expect(BigInt(response.amount)).toBe(expectedWei);
    });
  });

  describe('Invalid currency handling', () => {
    it('should reject invalid currency code', async () => {
      if (!gatewayReady) return;

      const client = createTestClient(TEST_MERCHANT);
      const orderId = `CURRENCY_INVALID_${Date.now()}`;

      const params: CreatePaymentParams = {
        orderId,
        amount: 10,
        tokenAddress: DEFAULT_TOKEN_ADDRESS,
        successUrl: 'http://localhost:3000/success',
        failUrl: 'http://localhost:3000/fail',
        currency: 'INVALID_CURRENCY',
      };

      await expect(client.createPayment(params)).rejects.toThrow();
    });

    it('should reject empty string currency code', async () => {
      if (!gatewayReady) return;

      const orderId = `CURRENCY_EMPTY_${Date.now()}`;

      // Use raw fetch to send empty string currency
      const res = await fetch(`${GATEWAY_BASE}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key': TEST_MERCHANT.publicKey!,
          Origin: TEST_MERCHANT.origin!,
        },
        body: JSON.stringify({
          orderId,
          amount: 10,
          tokenAddress: DEFAULT_TOKEN_ADDRESS,
          successUrl: 'http://localhost:3000/success',
          failUrl: 'http://localhost:3000/fail',
          currency: '',
        }),
      });

      // Should either reject with 400 or ignore empty currency (treat as no currency)
      if (res.ok) {
        // If accepted, currency fields should not be present
        const body = (await res.json()) as CreatePaymentResponse;
        expect(body.currency).toBeUndefined();
      } else {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expect(res.status).toBeLessThan(500);
      }
    });
  });
});
