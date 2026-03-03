import { describe, it, expect, beforeAll } from 'vitest';
import { Interface } from 'ethers';
import {
  getContract,
  getTokenBalance,
  approveToken,
  mintTokens,
  parseUnits,
  PaymentGatewayABI,
  ERC2771ForwarderABI,
} from '../helpers/blockchain';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES } from '../setup/wallets';
import { getToken } from '../fixtures/token';
import {
  encodePayFunctionData,
  signForwardRequest,
  getDeadline,
  type ForwardRequest,
} from '../helpers/signature';
import { createTestClient, TEST_MERCHANT, makeCreatePaymentParams } from '../helpers/sdk';
import type { CreatePaymentResponse } from '@solo-pay/gateway-sdk';

/**
 * Relay API Flow Integration Tests
 *
 * Tests the full Gateway relay API path:
 *   POST /payments/:id/relay  — submit gasless relay
 *   GET  /payments/:id/relay  — poll relay status
 *
 * Existing gasless tests call the forwarder contract directly.
 * These tests verify the gateway API relay layer end-to-end.
 *
 * Prerequisites:
 *   - Hardhat node running (port 8545)
 *   - Gateway API running (port 3001)
 *   - Simple-relayer running (port 3002)
 */

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
const GATEWAY_API_URL = `${GATEWAY_BASE}/api/v1`;

describe('Relay API Flow', () => {
  const token = getToken('test');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;
  const forwarderAddress = CONTRACT_ADDRESSES.forwarder;

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
   * Create a payment via SDK and build a signed ForwardRequest.
   */
  async function createPaymentAndBuildRelay(
    orderId: string,
    tokenAmount: number
  ): Promise<{
    createResponse: CreatePaymentResponse;
    forwardRequest: ForwardRequest;
    signature: string;
  }> {
    const client = createTestClient(TEST_MERCHANT);
    const params = makeCreatePaymentParams(tokenAmount, orderId);
    const createResponse = await client.createPayment(params);

    const amount = BigInt(createResponse.amount);

    // Approve token for gateway
    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    // Encode pay() function data
    const data = encodePayFunctionData(
      createResponse.paymentId,
      token.address,
      amount,
      createResponse.recipientAddress,
      createResponse.merchantId,
      createResponse.feeBps,
      BigInt(createResponse.deadline),
      BigInt(createResponse.escrowDuration),
      createResponse.serverSignature
    );

    // Build ForwardRequest
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI);
    const nonce = await forwarder.nonces(payerAddress);
    const forwardDeadline = getDeadline(1);

    const request: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline: forwardDeadline,
      data,
    };

    const signature = await signForwardRequest(request, payerPrivateKey);

    return { createResponse, forwardRequest: request, signature };
  }

  /**
   * Submit a gasless relay via the Gateway API.
   */
  async function submitRelay(
    paymentHash: string,
    request: ForwardRequest,
    signature: string
  ): Promise<Response> {
    return fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/relay`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-public-key': TEST_MERCHANT.publicKey!,
        Origin: TEST_MERCHANT.origin!,
      },
      body: JSON.stringify({
        paymentId: paymentHash,
        forwarderAddress,
        forwardRequest: {
          from: request.from,
          to: request.to,
          value: request.value.toString(),
          gas: request.gas.toString(),
          nonce: request.nonce.toString(),
          deadline: request.deadline.toString(),
          data: request.data,
          signature,
        },
      }),
    });
  }

  /**
   * Poll relay status until it reaches one of the target statuses.
   */
  async function waitForRelayStatus(
    paymentHash: string,
    targetStatuses: string[],
    timeoutMs: number = 30000
  ): Promise<{ status: string; transactionHash: string | null }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/relay`, {
          headers: {
            'x-public-key': TEST_MERCHANT.publicKey!,
            Origin: TEST_MERCHANT.origin!,
          },
          signal: AbortSignal.timeout(5000),
        });

        if (res.ok) {
          const body = (await res.json()) as {
            success: boolean;
            data: { status: string; transactionHash: string | null };
          };
          if (targetStatuses.includes(body.data.status)) {
            return body.data;
          }
        }
      } catch {
        // Retry
      }
      await sleep(1000);
    }

    throw new Error(
      `Relay for ${paymentHash} did not reach status ${targetStatuses.join('|')} within ${timeoutMs}ms`
    );
  }

  beforeAll(async () => {
    try {
      const [bcOk, gwOk] = await Promise.all([checkBlockchain(), checkGateway()]);
      if (!bcOk || !gwOk) {
        console.warn(
          '[relay-api-flow] Services not running, tests will be skipped.',
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
      console.warn('[relay-api-flow] Setup failed:', err);
    }
  });

  // ── Successful Relay Submission ───────────────────────────────────

  describe('Gasless relay submission via API', () => {
    it('should submit gasless relay and return 202', async () => {
      if (!isReady) return;

      const orderId = `RELAY_SUBMIT_${Date.now()}`;
      const { createResponse, forwardRequest, signature } =
        await createPaymentAndBuildRelay(orderId, 10);

      const res = await submitRelay(createResponse.paymentId, forwardRequest, signature);

      expect(res.status).toBe(202);
      const body = (await res.json()) as { success: boolean; status: string; message: string };
      expect(body.success).toBe(true);
      expect(body.status).toBeDefined();
    });

    it('should transition relay status to CONFIRMED after submission', async () => {
      if (!isReady) return;

      const orderId = `RELAY_CONFIRM_${Date.now()}`;
      const { createResponse, forwardRequest, signature } =
        await createPaymentAndBuildRelay(orderId, 15);

      // Submit relay
      const submitRes = await submitRelay(createResponse.paymentId, forwardRequest, signature);
      expect(submitRes.status).toBe(202);

      // Poll until CONFIRMED
      const relayStatus = await waitForRelayStatus(createResponse.paymentId, ['CONFIRMED'], 30000);
      expect(relayStatus.status).toBe('CONFIRMED');
      expect(relayStatus.transactionHash).toBeDefined();
      expect(relayStatus.transactionHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should verify payment is escrowed on-chain after relay confirms', async () => {
      if (!isReady) return;

      const orderId = `RELAY_ONCHAIN_${Date.now()}`;
      const { createResponse, forwardRequest, signature } =
        await createPaymentAndBuildRelay(orderId, 20);

      await submitRelay(createResponse.paymentId, forwardRequest, signature);
      await waitForRelayStatus(createResponse.paymentId, ['CONFIRMED'], 30000);

      // Verify on-chain
      const gateway = getContract(gatewayAddress, PaymentGatewayABI);
      const isProcessed = await gateway.isPaymentProcessed(createResponse.paymentId);
      expect(isProcessed).toBe(true);
    });
  });

  // ── Relay Status Polling ──────────────────────────────────────────

  describe('Relay status polling', () => {
    it('should return 404 for payment with no relay request', async () => {
      if (!isReady) return;

      // Create payment but do NOT submit relay
      const client = createTestClient(TEST_MERCHANT);
      const params = makeCreatePaymentParams(5, `RELAY_NORELAY_${Date.now()}`);
      const createRes = await client.createPayment(params);

      const res = await fetch(`${GATEWAY_API_URL}/payments/${createRes.paymentId}/relay`, {
        headers: {
          'x-public-key': TEST_MERCHANT.publicKey!,
          Origin: TEST_MERCHANT.origin!,
        },
      });

      expect(res.status).toBe(404);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('RELAY_NOT_FOUND');
    });

    it('should return relay status fields after submission', async () => {
      if (!isReady) return;

      const orderId = `RELAY_FIELDS_${Date.now()}`;
      const { createResponse, forwardRequest, signature } =
        await createPaymentAndBuildRelay(orderId, 8);

      await submitRelay(createResponse.paymentId, forwardRequest, signature);

      // Wait a moment for relay to be processed
      await sleep(2000);

      const res = await fetch(`${GATEWAY_API_URL}/payments/${createResponse.paymentId}/relay`, {
        headers: {
          'x-public-key': TEST_MERCHANT.publicKey!,
          Origin: TEST_MERCHANT.origin!,
        },
      });

      expect(res.ok).toBe(true);
      const body = (await res.json()) as {
        success: boolean;
        data: {
          status: string;
          transactionHash: string | null;
          errorMessage: string | null;
          createdAt: string;
          updatedAt: string;
        };
      };

      expect(body.success).toBe(true);
      expect(['QUEUED', 'SUBMITTED', 'CONFIRMED']).toContain(body.data.status);
      expect(body.data.createdAt).toBeDefined();
      expect(body.data.updatedAt).toBeDefined();
    });
  });

  // ── Validation & Error Cases ──────────────────────────────────────

  describe('Relay validation', () => {
    it('should reject relay with mismatched amount in forwardRequest data', async () => {
      if (!isReady) return;

      const orderId = `RELAY_MISMATCH_${Date.now()}`;
      const client = createTestClient(TEST_MERCHANT);
      const params = makeCreatePaymentParams(50, orderId);
      const createResponse = await client.createPayment(params);

      const correctAmount = BigInt(createResponse.amount);
      const wrongAmount = correctAmount + 1000000n; // Tamper with amount

      await approveToken(token.address, gatewayAddress, wrongAmount, payerPrivateKey);

      // Encode pay() with WRONG amount
      const iface = new Interface(PaymentGatewayABI);
      const tamperedData = iface.encodeFunctionData('pay', [
        createResponse.paymentId,
        token.address,
        wrongAmount, // Different from DB amount
        createResponse.recipientAddress,
        createResponse.merchantId,
        createResponse.feeBps,
        BigInt(createResponse.deadline),
        BigInt(createResponse.escrowDuration),
        createResponse.serverSignature,
        { deadline: 0n, v: 0, r: '0x' + '00'.repeat(32), s: '0x' + '00'.repeat(32) },
      ]);

      const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI);
      const nonce = await forwarder.nonces(payerAddress);
      const forwardDeadline = getDeadline(1);

      const request: ForwardRequest = {
        from: payerAddress,
        to: gatewayAddress,
        value: 0n,
        gas: 500000n,
        nonce,
        deadline: forwardDeadline,
        data: tamperedData,
      };

      const signature = await signForwardRequest(request, payerPrivateKey);

      const res = await submitRelay(createResponse.paymentId, request, signature);

      // Should be rejected because amount in data doesn't match DB
      expect(res.status).toBe(400);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe('VALIDATION_ERROR');
    });

    it('should reject relay on already-escrowed payment', async () => {
      if (!isReady) return;

      const orderId = `RELAY_ALREADYESCROW_${Date.now()}`;
      const { createResponse, forwardRequest, signature } =
        await createPaymentAndBuildRelay(orderId, 10);

      // Submit relay and wait for CONFIRMED
      await submitRelay(createResponse.paymentId, forwardRequest, signature);
      await waitForRelayStatus(createResponse.paymentId, ['CONFIRMED'], 30000);

      // Wait for payment to be detected as ESCROWED
      await sleep(5000);

      // Try to submit another relay - should fail because payment is no longer CREATED
      const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI);
      const newNonce = await forwarder.nonces(payerAddress);
      const newData = encodePayFunctionData(
        createResponse.paymentId,
        token.address,
        BigInt(createResponse.amount),
        createResponse.recipientAddress,
        createResponse.merchantId,
        createResponse.feeBps,
        BigInt(createResponse.deadline),
        BigInt(createResponse.escrowDuration),
        createResponse.serverSignature
      );

      const newRequest: ForwardRequest = {
        from: payerAddress,
        to: gatewayAddress,
        value: 0n,
        gas: 500000n,
        nonce: newNonce,
        deadline: getDeadline(1),
        data: newData,
      };

      await approveToken(
        token.address,
        gatewayAddress,
        BigInt(createResponse.amount),
        payerPrivateKey
      );
      const newSig = await signForwardRequest(newRequest, payerPrivateKey);

      const res = await submitRelay(createResponse.paymentId, newRequest, newSig);
      // 400 if DB status already updated to ESCROWED (INVALID_PAYMENT_STATUS)
      // 500 if DB still CREATED but relayer rejects duplicate on-chain tx
      expect(res.status).toBeGreaterThanOrEqual(400);
      const body = (await res.json()) as { code: string };
      expect(['INVALID_PAYMENT_STATUS', 'INTERNAL_ERROR']).toContain(body.code);
    });
  });
});
