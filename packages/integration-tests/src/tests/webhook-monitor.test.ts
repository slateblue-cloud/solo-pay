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
import { createTestClient, makeCreatePaymentParams, TEST_MERCHANT } from '../helpers/sdk';

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');
const GATEWAY_API_URL = `${GATEWAY_BASE}/api/v1`;

/**
 * Webhook Monitor Integration Tests
 *
 * These tests verify the full payment lifecycle including:
 *   1. Gateway creates payment (DB: CREATED)
 *   2. On-chain pay() → PaymentEscrowed event
 *   3. Webhook-manager detects on-chain status → DB: ESCROWED
 *   4. Gateway finalize API → DB: FINALIZE_SUBMITTED
 *   5. On-chain finalize() → PaymentFinalized event
 *   6. Webhook-manager detects → DB: FINALIZED
 *
 * And the cancel flow:
 *   3b. Gateway cancel API → DB: CANCEL_SUBMITTED
 *   4b. On-chain cancel() → PaymentCancelled event
 *   5b. Webhook-manager detects → DB: CANCELLED
 *
 * Prerequisites:
 *   - Hardhat node running (port 8545)
 *   - Gateway API running (port 3001)
 *   - Webhook-manager running (with blockchain monitor)
 *   - MySQL + Redis running
 */
describe('Webhook Monitor Integration', () => {
  const token = getToken('test');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const signerPrivateKey = HARDHAT_ACCOUNTS.signer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const recipientAddress = HARDHAT_ACCOUNTS.recipient.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;

  let isReady = false;

  beforeAll(async () => {
    // Check if all services are running
    try {
      const [blockchainOk, gatewayOk] = await Promise.all([checkBlockchain(), checkGateway()]);

      if (!blockchainOk || !gatewayOk) {
        console.warn(
          '[webhook-monitor] Skipping tests: services not running.',
          `blockchain=${blockchainOk} gateway=${gatewayOk}`,
          '\nRun: pnpm test:setup'
        );
        return;
      }

      isReady = true;

      // Ensure payer has enough tokens
      const balance = await getTokenBalance(token.address, payerAddress);
      if (balance < parseUnits('5000', token.decimals)) {
        await mintTokens(token.address, payerAddress, parseUnits('50000', token.decimals));
      }
    } catch (err) {
      console.warn('[webhook-monitor] Setup failed:', err);
    }
  });

  // ── Helpers ──────────────────────────────────────────────────────────

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

  /**
   * Create a payment via gateway API and execute pay() on-chain.
   * Uses the server signature and params from the gateway response directly.
   */
  async function createAndPayOnChain(
    orderId: string,
    tokenAmount: bigint
  ): Promise<{ paymentHash: string }> {
    // 1. Create payment via gateway API (returns server signature + all params)
    const client = createTestClient();
    const params = makeCreatePaymentParams(
      Number(tokenAmount / BigInt(10 ** token.decimals)),
      orderId
    );
    const createRes = await client.createPayment(params);
    const paymentHash = createRes.paymentId;

    // 2. Approve token and execute on-chain pay() using gateway response data
    await approveToken(token.address, gatewayAddress, tokenAmount, payerPrivateKey);

    const wallet = getWallet(payerPrivateKey);
    const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);
    const tx = await gateway.pay(
      paymentHash,
      token.address,
      tokenAmount,
      createRes.recipientAddress,
      createRes.merchantId,
      createRes.feeBps,
      BigInt(createRes.deadline),
      BigInt(createRes.escrowDuration),
      createRes.serverSignature,
      ZERO_PERMIT
    );
    await tx.wait();

    return { paymentHash };
  }

  /**
   * Poll merchant API for payment status until it matches expected status.
   */
  async function waitForDbStatus(
    paymentHash: string,
    expectedStatus: string,
    timeoutMs: number = 30000,
    intervalMs: number = 1000
  ): Promise<{ status: string; txHash?: string }> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const res = await fetch(`${GATEWAY_API_URL}/merchant/payments/${paymentHash}`, {
          headers: { 'x-api-key': TEST_MERCHANT.apiKey },
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          const body = (await res.json()) as { status: string; txHash?: string };
          if (body.status === expectedStatus) {
            return body;
          }
        }
      } catch {
        // Retry on fetch error
      }
      await sleep(intervalMs);
    }

    throw new Error(
      `Payment ${paymentHash} did not reach status ${expectedStatus} within ${timeoutMs}ms`
    );
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ── Tests ──────────────────────────────────────────────────────────

  describe('ESCROWED detection', () => {
    it('should detect on-chain PaymentEscrowed and update DB to ESCROWED', async () => {
      if (!isReady) return;

      const orderId = `WH_ESCROW_${Date.now()}`;
      const amount = parseUnits('100', token.decimals);

      const { paymentHash } = await createAndPayOnChain(orderId, amount);

      // Wait for webhook-manager to detect the on-chain Escrowed status
      const result = await waitForDbStatus(paymentHash, 'ESCROWED', 30000);
      expect(result.status).toBe('ESCROWED');
    });
  });

  describe('FINALIZED detection (full escrow → finalize flow)', () => {
    it('should detect on-chain PaymentFinalized and update DB to FINALIZED', async () => {
      if (!isReady) return;

      const orderId = `WH_FINALIZE_${Date.now()}`;
      const amount = parseUnits('100', token.decimals);

      // 1. Pay on-chain
      const { paymentHash } = await createAndPayOnChain(orderId, amount);

      // 2. Wait for ESCROWED
      await waitForDbStatus(paymentHash, 'ESCROWED', 30000);

      // 3. Call gateway finalize API → FINALIZE_SUBMITTED
      const finalizeRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_MERCHANT.apiKey,
        },
      });
      expect(finalizeRes.ok).toBe(true);
      const finalizeBody = (await finalizeRes.json()) as {
        success: boolean;
        data: { serverSignature: string; gatewayAddress: string; chainId: number };
      };
      expect(finalizeBody.success).toBe(true);

      // 4. Execute finalize on-chain with server signature
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const finalizeTx = await gateway.finalize(paymentHash, finalizeBody.data.serverSignature);
      await finalizeTx.wait();

      // 5. Wait for webhook-manager to detect FINALIZED
      const result = await waitForDbStatus(paymentHash, 'FINALIZED', 30000);
      expect(result.status).toBe('FINALIZED');
    });

    it('should record finalize txHash in DB', async () => {
      if (!isReady) return;

      const orderId = `WH_FIN_TX_${Date.now()}`;
      const amount = parseUnits('50', token.decimals);

      const { paymentHash } = await createAndPayOnChain(orderId, amount);
      await waitForDbStatus(paymentHash, 'ESCROWED', 30000);

      const finalizeRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_MERCHANT.apiKey,
        },
      });
      const finalizeBody = (await finalizeRes.json()) as {
        success: boolean;
        data: { serverSignature: string };
      };

      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const finalizeTx = await gateway.finalize(paymentHash, finalizeBody.data.serverSignature);
      await finalizeTx.wait();

      const result = await waitForDbStatus(paymentHash, 'FINALIZED', 30000);
      expect(result.status).toBe('FINALIZED');
      expect(result.txHash).toBeDefined();
      expect(result.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('CANCELLED detection (full escrow → cancel flow)', () => {
    it('should detect on-chain PaymentCancelled and update DB to CANCELLED', async () => {
      if (!isReady) return;

      const orderId = `WH_CANCEL_${Date.now()}`;
      const amount = parseUnits('100', token.decimals);
      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);

      // 1. Pay on-chain
      const { paymentHash } = await createAndPayOnChain(orderId, amount);

      // 2. Wait for ESCROWED
      await waitForDbStatus(paymentHash, 'ESCROWED', 30000);

      // 3. Call gateway cancel API → CANCEL_SUBMITTED
      const cancelRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_MERCHANT.apiKey,
        },
      });
      expect(cancelRes.ok).toBe(true);
      const cancelBody = (await cancelRes.json()) as {
        success: boolean;
        data: { serverSignature: string };
      };
      expect(cancelBody.success).toBe(true);

      // 4. Execute cancel on-chain with server signature
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const cancelTx = await gateway.cancel(paymentHash, cancelBody.data.serverSignature);
      await cancelTx.wait();

      // 5. Wait for webhook-manager to detect CANCELLED
      const result = await waitForDbStatus(paymentHash, 'CANCELLED', 30000);
      expect(result.status).toBe('CANCELLED');

      // 6. Verify funds returned to payer
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance).toBe(initialPayerBalance);
    });

    it('should record cancel txHash in DB', async () => {
      if (!isReady) return;

      const orderId = `WH_CAN_TX_${Date.now()}`;
      const amount = parseUnits('50', token.decimals);

      const { paymentHash } = await createAndPayOnChain(orderId, amount);
      await waitForDbStatus(paymentHash, 'ESCROWED', 30000);

      const cancelRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/cancel`, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_MERCHANT.apiKey,
        },
      });
      const cancelBody = (await cancelRes.json()) as {
        success: boolean;
        data: { serverSignature: string };
      };

      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const cancelTx = await gateway.cancel(paymentHash, cancelBody.data.serverSignature);
      await cancelTx.wait();

      const result = await waitForDbStatus(paymentHash, 'CANCELLED', 30000);
      expect(result.status).toBe('CANCELLED');
      expect(result.txHash).toBeDefined();
      expect(result.txHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Full lifecycle: escrow → finalize → verify balances', () => {
    it('should correctly transfer funds through full escrow lifecycle', async () => {
      if (!isReady) return;

      const orderId = `WH_LIFECYCLE_${Date.now()}`;
      const amount = parseUnits('200', token.decimals);

      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);
      const initialRecipientBalance = await getTokenBalance(token.address, recipientAddress);

      // 1. Pay → ESCROWED
      const { paymentHash } = await createAndPayOnChain(orderId, amount);
      await waitForDbStatus(paymentHash, 'ESCROWED', 30000);

      // Payer balance decreased
      const afterEscrowPayer = await getTokenBalance(token.address, payerAddress);
      expect(afterEscrowPayer).toBe(initialPayerBalance - amount);

      // 2. Finalize → FINALIZED
      const finalizeRes = await fetch(`${GATEWAY_API_URL}/payments/${paymentHash}/finalize`, {
        method: 'POST',
        headers: {
          'x-api-key': TEST_MERCHANT.apiKey,
        },
      });
      const finalizeBody = (await finalizeRes.json()) as {
        success: boolean;
        data: { serverSignature: string };
      };

      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const finalizeTx = await gateway.finalize(paymentHash, finalizeBody.data.serverSignature);
      await finalizeTx.wait();

      await waitForDbStatus(paymentHash, 'FINALIZED', 30000);

      // 3. Verify recipient received funds (amount minus fee if any)
      const finalRecipientBalance = await getTokenBalance(token.address, recipientAddress);
      expect(finalRecipientBalance).toBeGreaterThan(initialRecipientBalance);

      // Payer balance still decreased
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance).toBe(initialPayerBalance - amount);
    });
  });
});
