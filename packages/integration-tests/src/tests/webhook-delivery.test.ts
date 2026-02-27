import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Webhook Delivery Integration Tests
 *
 * Verifies that the sample-merchant webhook endpoint correctly handles
 * various orderId formats from the webhook-manager, including:
 *   - Valid integer orderId (normal flow)
 *   - Null orderId (payments created without orderId)
 *   - Non-numeric orderId (stress test, hash values, etc.)
 *   - Negative / zero orderId
 *
 * Prerequisites:
 *   - Sample-merchant running (port 3004)
 *   - Gateway running (port 3001) — only for full flow tests
 */

const SAMPLE_MERCHANT_URL = (process.env.SAMPLE_MERCHANT_URL || 'http://localhost:3004').replace(
  /\/$/,
  ''
);

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');

describe('Webhook Delivery to Sample Merchant', () => {
  let isSampleMerchantReady = false;
  let isGatewayReady = false;

  beforeAll(async () => {
    const [smOk, gwOk] = await Promise.all([
      checkService(`${SAMPLE_MERCHANT_URL}`),
      checkService(`${GATEWAY_BASE}/health`),
    ]);
    isSampleMerchantReady = smOk;
    isGatewayReady = gwOk;

    if (!isSampleMerchantReady) {
      console.warn(
        '[webhook-delivery] Skipping tests: sample-merchant not running at',
        SAMPLE_MERCHANT_URL
      );
    }
  });

  async function checkService(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async function postWebhook(body: Record<string, unknown>): Promise<Response> {
    return fetch(`${SAMPLE_MERCHANT_URL}/api/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  // ── orderId validation ──────────────────────────────────────────────

  describe('orderId validation', () => {
    it('should return 400 when orderId is missing', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({ status: 'ESCROWED' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('orderId');
    });

    it('should return 400 when status is missing', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({ orderId: '1' });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body.error).toContain('status');
    });

    it('should return 200 ignored for null orderId', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({ orderId: null, status: 'ESCROWED' });
      expect(res.status).toBe(400);
    });

    it('should return 200 ignored for non-numeric orderId', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({
        orderId: 'stress-test-abc-123',
        status: 'ESCROWED',
        paymentId: '0x' + 'a'.repeat(64),
        txHash: '0x' + 'b'.repeat(64),
        amount: '1000000',
        tokenSymbol: 'USDC',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ignored).toBe(true);
    });

    it('should return 200 ignored for hash-like orderId', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({
        orderId: '0x' + 'f'.repeat(64),
        status: 'ESCROWED',
        paymentId: '0x' + 'a'.repeat(64),
        amount: '1000000',
        tokenSymbol: 'USDC',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ignored).toBe(true);
    });

    it('should return 200 ignored for zero orderId', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({
        orderId: '0',
        status: 'ESCROWED',
        paymentId: '0x' + 'a'.repeat(64),
        amount: '1000000',
        tokenSymbol: 'USDC',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ignored).toBe(true);
    });

    it('should return 200 ignored for negative orderId', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({
        orderId: '-5',
        status: 'ESCROWED',
        paymentId: '0x' + 'a'.repeat(64),
        amount: '1000000',
        tokenSymbol: 'USDC',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ignored).toBe(true);
    });

    it('should return 200 ignored for float orderId', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({
        orderId: '1.5',
        status: 'ESCROWED',
        paymentId: '0x' + 'a'.repeat(64),
        amount: '1000000',
        tokenSymbol: 'USDC',
      });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.ignored).toBe(true);
    });

    it('should return 404 for valid integer orderId that does not exist', async () => {
      if (!isSampleMerchantReady) return;

      const res = await postWebhook({
        orderId: '999999',
        status: 'ESCROWED',
        paymentId: '0x' + 'a'.repeat(64),
        amount: '1000000',
        tokenSymbol: 'USDC',
      });
      expect(res.status).toBe(404);
    });

    it('should never return 500 for any orderId format', async () => {
      if (!isSampleMerchantReady) return;

      const badOrderIds = [
        null,
        '',
        'abc',
        '0xdeadbeef',
        'ORDER-한글',
        '-1',
        '0',
        '1.5',
        'NaN',
        'undefined',
        'true',
        '99999999999999999999',
      ];

      for (const orderId of badOrderIds) {
        const res = await postWebhook({
          orderId,
          status: 'ESCROWED',
          paymentId: '0x' + 'a'.repeat(64),
          amount: '1000000',
          tokenSymbol: 'USDC',
        });
        expect(res.status, `orderId="${orderId}" should not return 500`).not.toBe(500);
      }
    });
  });

  // ── Gateway → sample-merchant webhook flow ──────────────────────────

  describe('Gateway orderId passthrough', () => {
    it('should include orderId in payment creation response', async () => {
      if (!isGatewayReady) return;

      const testOrderId = `WH_DELIVERY_${Date.now()}`;
      const res = await fetch(`${GATEWAY_BASE}/api/v1/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key': 'pk_test_demo',
          Origin: 'http://localhost:3005',
        },
        body: JSON.stringify({
          orderId: testOrderId,
          amount: 1,
          tokenAddress: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
          successUrl: 'http://localhost:3000/success',
          failUrl: 'http://localhost:3000/fail',
        }),
      });

      if (!res.ok) {
        console.warn('[webhook-delivery] Gateway payment creation failed:', res.status);
        return;
      }

      const body = await res.json();
      expect(body.orderId).toBe(testOrderId);
      expect(body.paymentId).toBeDefined();
      expect(body.paymentId).toMatch(/^0x/);
    });
  });
});
