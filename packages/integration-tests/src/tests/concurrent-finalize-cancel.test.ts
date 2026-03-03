import { describe, it, expect, beforeAll } from 'vitest';
import {
  getWallet,
  getContract,
  getTokenBalance,
  approveToken,
  mintTokens,
  parseUnits,
  PaymentGatewayABI,
} from '../helpers/blockchain';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES } from '../setup/wallets';
import { getToken } from '../fixtures/token';
import { ZERO_PERMIT } from '../helpers/signature';
import { createTestClient, TEST_MERCHANT, makeCreatePaymentParams } from '../helpers/sdk';

/**
 * Concurrent Finalize/Cancel Race Condition Tests
 *
 * Verifies the optimistic locking mechanism (`claimForProcessing`)
 * ensures that concurrent finalize and cancel requests are properly
 * serialized — exactly one succeeds, the other gets 409 CONFLICT.
 *
 * Prerequisites:
 *   - Hardhat node running (port 8545)
 *   - Gateway API running (port 3001)
 *   - Simple-relayer running (port 3002)
 */

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
const GATEWAY_API_URL = `${GATEWAY_BASE}/api/v1`;

describe('Concurrent Finalize/Cancel', () => {
  const token = getToken('test');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;

  let isReady = false;

  async function checkBlockchain(): Promise<boolean> {
    try {
      const res = await fetch('http://localhost:8545', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

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

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  /**
   * Create a payment via gateway API and escrow on-chain.
   * Polls the merchant API until ESCROWED status is detected (sync-on-read).
   */
  async function createAndEscrowPayment(orderId: string, amount: bigint): Promise<string> {
    const client = createTestClient(TEST_MERCHANT);
    const params = makeCreatePaymentParams(
      Number(amount / BigInt(10 ** token.decimals)),
      orderId
    );
    const createRes = await client.createPayment(params);
    const paymentHash = createRes.paymentId;

    // Approve and pay on-chain
    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);
    const wallet = getWallet(payerPrivateKey);
    const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);
    const tx = await gateway.pay(
      paymentHash,
      token.address,
      amount,
      createRes.recipientAddress,
      createRes.merchantId,
      createRes.feeBps,
      BigInt(createRes.deadline),
      BigInt(createRes.escrowDuration),
      createRes.serverSignature,
      ZERO_PERMIT
    );
    await tx.wait();

    // Poll until sync-on-read detects ESCROWED
    await waitForDbStatus(paymentHash, 'ESCROWED');
    return paymentHash;
  }

  /**
   * Poll merchant API for payment status until it matches expected status.
   */
  async function waitForDbStatus(
    paymentHash: string,
    expectedStatus: string,
    timeoutMs: number = 30000
  ): Promise<{ status: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await fetch(`${GATEWAY_API_URL}/merchant/payments/${paymentHash}`, {
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const body = (await res.json()) as { status: string };
          if (body.status === expectedStatus) {
            return body;
          }
        }
      } catch {
        // Retry
      }
      await sleep(1000);
    }

    throw new Error(
      `Payment ${paymentHash} did not reach status ${expectedStatus} within ${timeoutMs}ms`
    );
  }

  /**
   * Get current payment status from merchant API (retries on transient 500).
   * The merchant endpoint's sync-on-read can return 500 when an on-chain
   * tx is in-flight; retrying after a short delay usually resolves it.
   */
  async function getPaymentStatus(paymentHash: string, retries = 3): Promise<string> {
    for (let i = 0; i < retries; i++) {
      const res = await fetch(`${GATEWAY_API_URL}/merchant/payments/${paymentHash}`, {
        headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const body = (await res.json()) as { status: string };
        return body.status;
      }
      if (res.status >= 500 && i < retries - 1) {
        await sleep(2000);
        continue;
      }
      throw new Error(`Failed to get payment status: ${res.status}`);
    }
    throw new Error('getPaymentStatus: exhausted retries');
  }

  beforeAll(async () => {
    try {
      const [bcOk, gwOk] = await Promise.all([checkBlockchain(), checkGateway()]);
      if (!bcOk || !gwOk) {
        console.warn(
          '[concurrent-finalize-cancel] Services not running, tests will be skipped.',
          `blockchain=${bcOk} gateway=${gwOk}`
        );
        return;
      }
      isReady = true;

      // Ensure payer has tokens
      const balance = await getTokenBalance(token.address, payerAddress);
      if (balance < parseUnits('5000', token.decimals)) {
        await mintTokens(token.address, payerAddress, parseUnits('50000', token.decimals));
      }
    } catch (err) {
      console.warn('[concurrent-finalize-cancel] Setup failed:', err);
    }
  });

  // ── Concurrent Finalize + Cancel ──────────────────────────────────

  describe('Concurrent finalize and cancel on same payment', () => {
    it('should allow exactly one of finalize/cancel to succeed (other gets 409)', async () => {
      if (!isReady) return;

      const orderId = `CONC_FIN_CAN_${Date.now()}`;
      const amount = parseUnits('100', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // Fire both finalize and cancel concurrently
      const [finalizeRes, cancelRes] = await Promise.all([
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
      ]);

      const statuses = [finalizeRes.status, cancelRes.status].sort();

      // Exactly one should succeed (200), the other should conflict (409)
      expect(statuses).toEqual([200, 409]);

      // Wait briefly for the winning operation's tx to propagate
      await sleep(2000);

      // Verify final state is consistent
      const finalStatus = await getPaymentStatus(paymentHash);
      expect(['FINALIZE_SUBMITTED', 'CANCEL_SUBMITTED', 'FINALIZED', 'CANCELLED']).toContain(
        finalStatus
      );
    });

    it('should verify only one state transition occurred', async () => {
      if (!isReady) return;

      const orderId = `CONC_VERIFY_${Date.now()}`;
      const amount = parseUnits('75', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // Fire both concurrently
      const results = await Promise.all([
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
      ]);

      const successResults = results.filter((r) => r.status === 200);
      const conflictResults = results.filter((r) => r.status === 409);

      expect(successResults.length).toBe(1);
      expect(conflictResults.length).toBe(1);

      // The winner's body should contain paymentId
      const winnerBody = (await successResults[0].json()) as {
        success: boolean;
        data: { paymentId: string; relayRequestId: string };
      };
      expect(winnerBody.success).toBe(true);
      expect(winnerBody.data.paymentId).toBe(paymentHash);

      // The loser's body should have CONFLICT code
      const loserBody = (await conflictResults[0].json()) as { code: string };
      expect(loserBody.code).toBe('CONFLICT');
    });
  });

  // ── Double Finalize ───────────────────────────────────────────────

  describe('Double finalize prevention', () => {
    it('should reject second finalize after first succeeds', async () => {
      if (!isReady) return;

      const orderId = `CONC_DBL_FIN_${Date.now()}`;
      const amount = parseUnits('80', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // First finalize should succeed
      const firstRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
        method: 'POST',
        headers: { 'x-api-key': TEST_MERCHANT.apiKey },
      });
      expect(firstRes.status).toBe(200);

      // Second finalize should fail
      const secondRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
        method: 'POST',
        headers: { 'x-api-key': TEST_MERCHANT.apiKey },
      });

      // Should be 400 (invalid status) or 409 (conflict)
      expect([400, 409]).toContain(secondRes.status);
    });

    it('should reject concurrent double finalize — only one succeeds', async () => {
      if (!isReady) return;

      const orderId = `CONC_DBL_FIN2_${Date.now()}`;
      const amount = parseUnits('60', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // Fire two finalize requests concurrently
      const [res1, res2] = await Promise.all([
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      // One should be 200, the other 409
      expect(statuses).toEqual([200, 409]);
    });
  });

  // ── Double Cancel ─────────────────────────────────────────────────

  describe('Double cancel prevention', () => {
    it('should reject second cancel after first succeeds', async () => {
      if (!isReady) return;

      const orderId = `CONC_DBL_CAN_${Date.now()}`;
      const amount = parseUnits('90', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // First cancel should succeed
      const firstRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
        method: 'POST',
        headers: { 'x-api-key': TEST_MERCHANT.apiKey },
      });
      expect(firstRes.status).toBe(200);

      // Second cancel should fail
      const secondRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
        method: 'POST',
        headers: { 'x-api-key': TEST_MERCHANT.apiKey },
      });

      // Should be 400 (invalid status) or 409 (conflict)
      expect([400, 409]).toContain(secondRes.status);
    });

    it('should reject concurrent double cancel — only one succeeds', async () => {
      if (!isReady) return;

      const orderId = `CONC_DBL_CAN2_${Date.now()}`;
      const amount = parseUnits('55', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // Fire two cancel requests concurrently
      const [res1, res2] = await Promise.all([
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([200, 409]);
    });
  });

  // ── Final State Consistency ───────────────────────────────────────

  describe('Final state consistency', () => {
    it('should reach a terminal state after concurrent operations complete', async () => {
      if (!isReady) return;

      const orderId = `CONC_TERMINAL_${Date.now()}`;
      const amount = parseUnits('120', token.decimals);

      const paymentHash = await createAndEscrowPayment(orderId, amount);

      // Fire finalize and cancel concurrently
      const results = await Promise.all([
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
        fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
          method: 'POST',
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
        }),
      ]);

      // Exactly one should succeed
      const successResults = results.filter((r) => r.status === 200);
      expect(successResults.length).toBe(1);

      // Wait for the winning operation to complete on-chain
      await sleep(5000);

      // Verify on-chain: payment should still be processed (escrow existed)
      const gateway = getContract(gatewayAddress, PaymentGatewayABI);
      const isProcessed = await gateway.isPaymentProcessed(paymentHash);
      expect(isProcessed).toBe(true);

      // The winning response should contain a relay request ID
      const winnerBody = (await successResults[0].json()) as {
        success: boolean;
        data: { paymentId: string; relayRequestId: string };
      };
      expect(winnerBody.success).toBe(true);
      expect(winnerBody.data.paymentId).toBe(paymentHash);
    });
  });
});
