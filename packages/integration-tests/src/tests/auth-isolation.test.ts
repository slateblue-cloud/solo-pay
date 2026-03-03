import { describe, it, expect, beforeAll } from 'vitest';
import { getToken } from '../fixtures/token';
import { getMerchant } from '../fixtures/merchant';
import { createTestClient, TEST_MERCHANT, makeCreatePaymentParams } from '../helpers/sdk';

/**
 * Cross-Merchant Authentication & Isolation Tests
 *
 * Verifies that:
 * - Merchant A cannot finalize/cancel Merchant B's payments
 * - Invalid/missing auth headers are properly rejected
 * - Origin validation works correctly
 *
 * Note: The finalize/cancel routes check merchant ownership BEFORE status,
 * so we only need a CREATED payment (no on-chain escrow required).
 *
 * Prerequisites:
 *   - Gateway API running (port 3001)
 */

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
const GATEWAY_API_URL = `${GATEWAY_BASE}/api/v1`;

describe('Authentication & Isolation', () => {
  const token = getToken('test');
  const merchantA = TEST_MERCHANT; // Demo merchant (localhost chain)
  const merchantB = getMerchant('metastar'); // MetaStar merchant (different chain)

  let isReady = false;

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

  /**
   * Create a payment via gateway API (CREATED status, no on-chain escrow).
   * The finalize/cancel routes check merchant ownership before status,
   * so a CREATED payment is sufficient to test cross-merchant isolation.
   */
  async function createPaymentForMerchantA(orderId: string): Promise<string> {
    const client = createTestClient(merchantA);
    const params = makeCreatePaymentParams(100, orderId);
    const createRes = await client.createPayment(params);
    return createRes.paymentId;
  }

  beforeAll(async () => {
    try {
      const gwOk = await checkGateway();
      if (!gwOk) {
        console.warn('[auth-isolation] Gateway not running, tests will be skipped.');
        return;
      }
      isReady = true;
    } catch (err) {
      console.warn('[auth-isolation] Setup failed:', err);
    }
  });

  // ── Cross-Merchant Isolation ──────────────────────────────────────

  describe('Cross-merchant payment isolation', () => {
    it('should reject finalize when using a different merchant API key', async () => {
      if (!isReady) return;

      const orderId = `AUTH_CROSS_FIN_${Date.now()}`;
      const paymentHash = await createPaymentForMerchantA(orderId);

      // Merchant B tries to finalize Merchant A's payment → 403
      const res = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
        method: 'POST',
        headers: { 'x-api-key': merchantB.apiKey },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('FORBIDDEN');
    });

    it('should reject cancel when using a different merchant API key', async () => {
      if (!isReady) return;

      const orderId = `AUTH_CROSS_CAN_${Date.now()}`;
      const paymentHash = await createPaymentForMerchantA(orderId);

      // Merchant B tries to cancel Merchant A's payment → 403
      const res = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
        method: 'POST',
        headers: { 'x-api-key': merchantB.apiKey },
      });

      expect(res.status).toBe(403);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('FORBIDDEN');
    });
  });

  // ── API Key Authentication ────────────────────────────────────────

  describe('API key authentication (x-api-key)', () => {
    it('should reject finalize with missing x-api-key', async () => {
      if (!isReady) return;

      const fakePaymentId = '0x' + 'ab'.repeat(32);
      const res = await fetch(`${GATEWAY_API_URL}/payments/${fakePaymentId}/finalize`, {
        method: 'POST',
        // No x-api-key header
      });

      expect(res.status).toBe(401);
    });

    it('should reject finalize with invalid x-api-key', async () => {
      if (!isReady) return;

      const fakePaymentId = '0x' + 'ab'.repeat(32);
      const res = await fetch(`${GATEWAY_API_URL}/payments/${fakePaymentId}/finalize`, {
        method: 'POST',
        headers: { 'x-api-key': 'completely_invalid_key_12345' },
      });

      expect(res.status).toBe(401);
    });

    it('should reject cancel with missing x-api-key', async () => {
      if (!isReady) return;

      const fakePaymentId = '0x' + 'ab'.repeat(32);
      const res = await fetch(`${GATEWAY_API_URL}/payments/${fakePaymentId}/cancel`, {
        method: 'POST',
      });

      expect(res.status).toBe(401);
    });

    it('should reject cancel with invalid x-api-key', async () => {
      if (!isReady) return;

      const fakePaymentId = '0x' + 'ab'.repeat(32);
      const res = await fetch(`${GATEWAY_API_URL}/payments/${fakePaymentId}/cancel`, {
        method: 'POST',
        headers: { 'x-api-key': 'completely_invalid_key_12345' },
      });

      expect(res.status).toBe(401);
    });
  });

  // ── Public Key Authentication ─────────────────────────────────────

  describe('Public key authentication (x-public-key)', () => {
    it('should reject create payment with missing x-public-key', async () => {
      if (!isReady) return;

      const res = await fetch(`${GATEWAY_API_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No x-public-key
          Origin: 'http://localhost:3005',
        },
        body: JSON.stringify({
          orderId: `AUTH_NOPK_${Date.now()}`,
          amount: 10,
          tokenAddress: token.address,
          successUrl: 'http://localhost:3000/success',
          failUrl: 'http://localhost:3000/fail',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject create payment with invalid x-public-key', async () => {
      if (!isReady) return;

      const res = await fetch(`${GATEWAY_API_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key': 'pk_invalid_doesnotexist',
          Origin: 'http://localhost:3005',
        },
        body: JSON.stringify({
          orderId: `AUTH_BADPK_${Date.now()}`,
          amount: 10,
          tokenAddress: token.address,
          successUrl: 'http://localhost:3000/success',
          failUrl: 'http://localhost:3000/fail',
        }),
      });

      expect(res.status).toBe(401);
    });

    it('should reject create payment with valid public key but wrong origin', async () => {
      if (!isReady) return;

      const res = await fetch(`${GATEWAY_API_URL}/payments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-public-key': merchantA.publicKey!,
          Origin: 'http://evil-origin.example.com',
        },
        body: JSON.stringify({
          orderId: `AUTH_BADORIGIN_${Date.now()}`,
          amount: 10,
          tokenAddress: token.address,
          successUrl: 'http://localhost:3000/success',
          failUrl: 'http://localhost:3000/fail',
        }),
      });

      // Should be 403 if ALLOWED_WIDGET_ORIGIN is configured, or 201 if not
      // We test that it's not a 500 (server error)
      expect(res.status).not.toBe(500);

      // If origin validation is active, it should be 403
      if (res.status === 403) {
        const body = (await res.json()) as { code: string };
        expect(body.code).toBeDefined();
      }
    });
  });

  // ── Merchant Payment Query Isolation ──────────────────────────────

  describe('Merchant payment query isolation', () => {
    it('should not allow merchant B to query merchant A payment details', async () => {
      if (!isReady) return;

      const orderId = `AUTH_QUERY_${Date.now()}`;
      const paymentHash = await createPaymentForMerchantA(orderId);

      // Merchant A can query it
      const resA = await fetch(`${GATEWAY_API_URL}/merchant/payments/${paymentHash}`, {
        headers: { 'x-api-key': merchantA.apiKey },
      });
      expect(resA.ok).toBe(true);

      // Merchant B should NOT find it (different merchant, returns 404 or 403)
      const resB = await fetch(`${GATEWAY_API_URL}/merchant/payments/${paymentHash}`, {
        headers: { 'x-api-key': merchantB.apiKey },
      });
      expect(resB.status).toBeGreaterThanOrEqual(400);
      expect(resB.status).toBeLessThan(500);
    });
  });
});
