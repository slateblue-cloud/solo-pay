import { describe, it, expect, beforeAll } from 'vitest';
import {
  getWallet,
  getContract,
  getTokenBalance,
  approveToken,
  mintTokens,
  parseUnits,
  increaseTime,
  PaymentGatewayABI,
} from '../helpers/blockchain';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES } from '../setup/wallets';
import { getToken } from '../fixtures/token';
import {
  generatePaymentId,
  signPaymentRequest,
  signCancelRequest,
  signFinalizeRequest,
  merchantKeyToId,
  getDeadline,
  ZERO_PERMIT,
  DEFAULT_ESCROW_DURATION,
  type PaymentParams,
} from '../helpers/signature';

describe('Cancel Flow Integration', () => {
  const token = getToken('mockUSDT');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const signerPrivateKey = HARDHAT_ACCOUNTS.signer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const recipientAddress = HARDHAT_ACCOUNTS.recipient.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;

  const merchantKey = 'merchant_demo_001';
  const merchantId = merchantKeyToId(merchantKey);

  beforeAll(async () => {
    const balance = await getTokenBalance(token.address, payerAddress);
    if (balance < parseUnits('1000', token.decimals)) {
      await mintTokens(token.address, payerAddress, parseUnits('10000', token.decimals));
    }
  });

  /**
   * Helper: pay() → Escrowed state (finalize 안 함)
   */
  async function escrowPayment(
    orderId: string,
    amount: bigint,
    feeBps: number = 0,
    escrowDuration: bigint = DEFAULT_ESCROW_DURATION
  ): Promise<string> {
    const paymentId = generatePaymentId(orderId);
    const deadline = getDeadline(1);
    const paymentParams: PaymentParams = {
      paymentId,
      tokenAddress: token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      deadline,
      escrowDuration,
    };
    const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    const wallet = getWallet(payerPrivateKey);
    const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);
    const tx = await gateway.pay(
      paymentId,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      deadline,
      escrowDuration,
      serverSignature,
      ZERO_PERMIT
    );
    await tx.wait();

    return paymentId;
  }

  describe('Cancel Before Deadline (Server Signature)', () => {
    it('should cancel escrowed payment and return full amount to payer', async () => {
      const amount = parseUnits('100', token.decimals);
      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);

      const paymentId = await escrowPayment(`ORDER_CANCEL_OK_${Date.now()}`, amount);

      // Payer balance decreased after escrow
      const afterEscrowBalance = await getTokenBalance(token.address, payerAddress);
      expect(afterEscrowBalance).toBe(initialPayerBalance - amount);

      // Cancel with server signature
      const cancelSignature = await signCancelRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const tx = await gateway.cancel(paymentId, cancelSignature);
      await tx.wait();

      // Payer balance restored
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance).toBe(initialPayerBalance);
    });

    it('should cancel payment with fee and return full amount (no fee deduction)', async () => {
      const amount = parseUnits('100', token.decimals);
      const feeBps = 500; // 5%
      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);

      const paymentId = await escrowPayment(`ORDER_CANCEL_FEE_${Date.now()}`, amount, feeBps);

      // Cancel returns full amount, not amount minus fee
      const cancelSignature = await signCancelRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const tx = await gateway.cancel(paymentId, cancelSignature);
      await tx.wait();

      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance).toBe(initialPayerBalance);
    });

    it('should reject cancel with invalid signature', async () => {
      const amount = parseUnits('50', token.decimals);
      const paymentId = await escrowPayment(`ORDER_CANCEL_BADSIG_${Date.now()}`, amount);

      // Sign with wrong key
      const wrongSignature = await signCancelRequest(
        paymentId,
        HARDHAT_ACCOUNTS.relayer.privateKey
      );

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(gateway.cancel(paymentId, wrongSignature)).rejects.toThrow();
    });

    it('should reject cancel on non-existent payment', async () => {
      const fakePaymentId = generatePaymentId(`ORDER_FAKE_${Date.now()}`);
      const cancelSignature = await signCancelRequest(fakePaymentId, signerPrivateKey);

      const wallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(gateway.cancel(fakePaymentId, cancelSignature)).rejects.toThrow();
    });

    it('should reject cancel on already cancelled payment', async () => {
      const amount = parseUnits('50', token.decimals);
      const paymentId = await escrowPayment(`ORDER_CANCEL_DUP_${Date.now()}`, amount);

      const cancelSignature = await signCancelRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);

      const tx = await gateway.cancel(paymentId, cancelSignature);
      await tx.wait();

      // Second cancel should revert
      await expect(gateway.cancel(paymentId, cancelSignature)).rejects.toThrow();
    });

    it('should reject cancel on finalized payment', async () => {
      const amount = parseUnits('50', token.decimals);
      const paymentId = await escrowPayment(`ORDER_CANCEL_FINALIZED_${Date.now()}`, amount);

      // Finalize first
      const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const finalizeTx = await gateway.finalize(paymentId, finalizeSignature);
      await finalizeTx.wait();

      // Cancel should revert (not escrowed)
      const cancelSignature = await signCancelRequest(paymentId, signerPrivateKey);
      await expect(gateway.cancel(paymentId, cancelSignature)).rejects.toThrow();
    });
  });

  describe('Cancel After Deadline (Permissionless)', () => {
    it('should allow permissionless cancel after escrow deadline', async () => {
      const amount = parseUnits('100', token.decimals);
      const shortEscrow = 60n; // 60 seconds
      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);

      const paymentId = await escrowPayment(
        `ORDER_CANCEL_PERM_${Date.now()}`,
        amount,
        0,
        shortEscrow
      );

      // Advance time past escrow deadline
      await increaseTime(Number(shortEscrow) + 1);

      // Anyone can cancel without valid signature (use relayer account)
      const otherWallet = getWallet(HARDHAT_ACCOUNTS.relayer.privateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, otherWallet);
      const tx = await gateway.cancel(paymentId, '0x');
      await tx.wait();

      // Payer balance restored
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance).toBe(initialPayerBalance);
    });

    it('should reject finalize after escrow deadline', async () => {
      const amount = parseUnits('50', token.decimals);
      const shortEscrow = 60n;

      const paymentId = await escrowPayment(
        `ORDER_FINALIZE_EXPIRED_${Date.now()}`,
        amount,
        0,
        shortEscrow
      );

      // Advance time past escrow deadline
      await increaseTime(Number(shortEscrow) + 1);

      // Finalize should fail after deadline
      const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);

      await expect(gateway.finalize(paymentId, finalizeSignature)).rejects.toThrow();
    });
  });

  describe('Cancel-Finalize Mutual Exclusion', () => {
    it('should not allow finalize after cancel', async () => {
      const amount = parseUnits('50', token.decimals);
      const paymentId = await escrowPayment(`ORDER_CANCEL_THEN_FIN_${Date.now()}`, amount);

      // Cancel
      const cancelSignature = await signCancelRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const cancelTx = await gateway.cancel(paymentId, cancelSignature);
      await cancelTx.wait();

      // Finalize should fail
      const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
      await expect(gateway.finalize(paymentId, finalizeSignature)).rejects.toThrow();
    });

    it('should not allow cancel after finalize', async () => {
      const amount = parseUnits('50', token.decimals);
      const paymentId = await escrowPayment(`ORDER_FIN_THEN_CANCEL_${Date.now()}`, amount);

      // Finalize
      const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
      const signerWallet = getWallet(signerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
      const finalizeTx = await gateway.finalize(paymentId, finalizeSignature);
      await finalizeTx.wait();

      // Cancel should fail
      const cancelSignature = await signCancelRequest(paymentId, signerPrivateKey);
      await expect(gateway.cancel(paymentId, cancelSignature)).rejects.toThrow();
    });
  });
});
