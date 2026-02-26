import { describe, it, expect, beforeAll } from 'vitest';
import {
  getProvider,
  getWallet,
  getContract,
  getTokenBalance,
  approveToken,
  mintTokens,
  parseUnits,
  PaymentGatewayABI,
  ERC2771ForwarderABI,
} from '../helpers/blockchain';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES, TEST_CHAIN_ID } from '../setup/wallets';
import { getToken } from '../fixtures/token';
import {
  generatePaymentId,
  signPaymentRequest,
  signRefundRequest,
  signFinalizeRequest,
  signForwardRequest,
  encodeRefundFunctionData,
  buildForwardRequestData,
  merchantKeyToId,
  getDeadline,
  ZERO_PERMIT,
  DEFAULT_ESCROW_DURATION,
  type PaymentParams,
  type ForwardRequest,
} from '../helpers/signature';

describe('Refund Flow Integration', () => {
  const token = getToken('mockUSDT');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const signerPrivateKey = HARDHAT_ACCOUNTS.signer.privateKey;
  const relayerPrivateKey = HARDHAT_ACCOUNTS.relayer.privateKey;
  const recipientPrivateKey = HARDHAT_ACCOUNTS.recipient.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const recipientAddress = HARDHAT_ACCOUNTS.recipient.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;
  const forwarderAddress = CONTRACT_ADDRESSES.forwarder;

  const merchantKey = 'merchant_demo_001';
  const merchantId = merchantKeyToId(merchantKey);

  let blockchainRunning = false;

  async function checkBlockchain(): Promise<boolean> {
    try {
      const provider = getProvider();
      await provider.getBlockNumber();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Helper: Execute a payment (payer -> escrow -> finalize -> recipient) and return the paymentId.
   * All payments go through escrow, then finalize to release to recipient.
   */
  async function executePayment(
    orderId: string,
    amount: bigint,
    feeBps: number = 0
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
      escrowDuration: DEFAULT_ESCROW_DURATION,
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
      DEFAULT_ESCROW_DURATION,
      serverSignature,
      ZERO_PERMIT
    );
    await tx.wait();

    // Finalize the payment so it can be refunded (server calls finalize)
    const signerWallet = getWallet(signerPrivateKey);
    const gatewayAsSigner = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
    const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
    const finalizeTx = await gatewayAsSigner.finalize(paymentId, finalizeSignature);
    await finalizeTx.wait();

    return paymentId;
  }

  /**
   * Helper: Execute a refund from recipient (merchant) to payer.
   * Refund reads token, amount, payer from on-chain storage.
   * Recipient must approve the gateway for the full payment amount.
   */
  async function executeRefund(paymentId: string, amount: bigint): Promise<void> {
    const refundSignature = await signRefundRequest(paymentId, signerPrivateKey);

    // Recipient approves gateway to spend tokens for the refund
    await approveToken(token.address, gatewayAddress, amount, recipientPrivateKey);

    // Recipient calls refund (msg.sender = recipient)
    const recipientWallet = getWallet(recipientPrivateKey);
    const gateway = getContract(gatewayAddress, PaymentGatewayABI, recipientWallet);

    const tx = await gateway.refund(paymentId, refundSignature, ZERO_PERMIT);
    await tx.wait();
  }

  beforeAll(async () => {
    blockchainRunning = await checkBlockchain();
    if (!blockchainRunning) {
      console.warn(
        '\n⚠️  Hardhat node is not running. Refund flow tests will be skipped.\n' +
          '   Run: pnpm --filter @globalmsq/integration-tests test:setup\n'
      );
      return;
    }

    // Ensure payer has enough tokens for payments
    const payerBalance = await getTokenBalance(token.address, payerAddress);
    if (payerBalance < parseUnits('5000', token.decimals)) {
      await mintTokens(token.address, payerAddress, parseUnits('10000', token.decimals));
    }

    // Ensure recipient has enough tokens for refunds
    // Payment proceeds go to recipient; recipient uses those to refund
    const recipientBalance = await getTokenBalance(token.address, recipientAddress);
    if (recipientBalance < parseUnits('5000', token.decimals)) {
      await mintTokens(token.address, recipientAddress, parseUnits('10000', token.decimals));
    }
  });

  describe('Direct Refund', () => {
    it('should complete a direct refund after successful payment', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('100', token.decimals);
      const paymentId = await executePayment(`ORDER_REFUND_OK_${Date.now()}`, amount);

      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);
      const initialRecipientBalance = await getTokenBalance(token.address, recipientAddress);

      await executeRefund(paymentId, amount);

      // Verify refund is recorded on-chain
      const gateway = getContract(gatewayAddress, PaymentGatewayABI);
      const isRefunded = await gateway.isPaymentRefunded(paymentId);
      expect(isRefunded).toBe(true);

      // Verify balance changes: recipient -> payer
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      const finalRecipientBalance = await getTokenBalance(token.address, recipientAddress);

      expect(finalPayerBalance).toBe(initialPayerBalance + amount);
      expect(finalRecipientBalance).toBe(initialRecipientBalance - amount);
    });

    it('should verify payer receives exact refund amount', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('250', token.decimals);
      const paymentId = await executePayment(`ORDER_REFUND_EXACT_${Date.now()}`, amount);

      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);

      await executeRefund(paymentId, amount);

      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance - initialPayerBalance).toBe(amount);
    });
  });

  describe('Duplicate Refund Prevention', () => {
    it('should reject duplicate refund for the same payment', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('50', token.decimals);
      const paymentId = await executePayment(`ORDER_REFUND_DUP_${Date.now()}`, amount);

      // First refund succeeds
      await executeRefund(paymentId, amount);

      // Second refund with same paymentId should revert
      const refundSignature = await signRefundRequest(paymentId, signerPrivateKey);

      await approveToken(token.address, gatewayAddress, amount, recipientPrivateKey);

      const recipientWallet = getWallet(recipientPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, recipientWallet);

      await expect(gateway.refund(paymentId, refundSignature, ZERO_PERMIT)).rejects.toThrow();
    });
  });

  describe('Signature Validation', () => {
    it('should reject refund with invalid server signature', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('50', token.decimals);
      const paymentId = await executePayment(`ORDER_REFUND_BADSIG_${Date.now()}`, amount);

      // Sign with wrong key (relayer instead of signer)
      const wrongSignature = await signRefundRequest(
        paymentId,
        HARDHAT_ACCOUNTS.relayer.privateKey
      );

      await approveToken(token.address, gatewayAddress, amount, recipientPrivateKey);

      const recipientWallet = getWallet(recipientPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, recipientWallet);

      await expect(gateway.refund(paymentId, wrongSignature, ZERO_PERMIT)).rejects.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should reject refund for non-existent payment', async () => {
      if (!blockchainRunning) return;

      const fakePaymentId = generatePaymentId(`ORDER_FAKE_${Date.now()}`);

      const refundSignature = await signRefundRequest(fakePaymentId, signerPrivateKey);

      const recipientWallet = getWallet(recipientPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, recipientWallet);

      await expect(gateway.refund(fakePaymentId, refundSignature, ZERO_PERMIT)).rejects.toThrow();
    });

    it('should reject refund from non-recipient', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('50', token.decimals);
      const paymentId = await executePayment(`ORDER_REFUND_NOTRECIP_${Date.now()}`, amount);

      const refundSignature = await signRefundRequest(paymentId, signerPrivateKey);

      // Payer (not recipient) tries to call refund
      const payerWallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, payerWallet);

      await expect(gateway.refund(paymentId, refundSignature, ZERO_PERMIT)).rejects.toThrow();
    });
  });

  describe('Gasless Refund (Meta-Transaction)', () => {
    it('should process refund via forwarder meta-transaction', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('75', token.decimals);
      const paymentId = await executePayment(`ORDER_REFUND_GASLESS_${Date.now()}`, amount);

      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);

      const refundSignature = await signRefundRequest(paymentId, signerPrivateKey);

      // Recipient (merchant) approves gateway for the refund amount
      // In meta-tx, _msgSender() = recipient (from ForwardRequest.from)
      await approveToken(token.address, gatewayAddress, amount, recipientPrivateKey);

      // Encode refund calldata
      const refundCalldata = encodeRefundFunctionData(paymentId, refundSignature);

      // Build ForwardRequest - from = recipient (merchant)
      // The forwarder will set _msgSender() to recipientAddress
      const relayerWallet = getWallet(relayerPrivateKey);
      const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

      const recipientNonce = await forwarder.nonces(recipientAddress);
      const forwardDeadline = getDeadline(1);

      const forwardRequest: ForwardRequest = {
        from: recipientAddress,
        to: gatewayAddress,
        value: 0n,
        gas: 500000n,
        nonce: recipientNonce,
        deadline: forwardDeadline,
        data: refundCalldata,
      };

      // Recipient signs the forward request (gasless for recipient)
      const forwardSignature = await signForwardRequest(
        forwardRequest,
        recipientPrivateKey,
        forwarderAddress,
        TEST_CHAIN_ID
      );

      const forwardRequestData = buildForwardRequestData(forwardRequest, forwardSignature);

      // Relayer submits meta-transaction
      const tx = await forwarder.execute(forwardRequestData);
      await tx.wait();

      // Verify refund completed
      const gateway = getContract(gatewayAddress, PaymentGatewayABI);
      const isRefunded = await gateway.isPaymentRefunded(paymentId);
      expect(isRefunded).toBe(true);

      // Verify payer got tokens back
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      expect(finalPayerBalance).toBe(initialPayerBalance + amount);
    });
  });

  describe('Payment-Refund Full Lifecycle', () => {
    it('should handle complete payment -> refund cycle with balance verification', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('200', token.decimals);

      const initialPayerBalance = await getTokenBalance(token.address, payerAddress);
      const initialRecipientBalance = await getTokenBalance(token.address, recipientAddress);

      // Step 1: Execute payment (payer -> escrow -> finalize -> recipient)
      const paymentId = await executePayment(`ORDER_LIFECYCLE_${Date.now()}`, amount);

      // Verify payment deducted from payer, sent to recipient (after finalize)
      const afterPaymentPayerBalance = await getTokenBalance(token.address, payerAddress);
      const afterPaymentRecipientBalance = await getTokenBalance(token.address, recipientAddress);
      expect(afterPaymentPayerBalance).toBe(initialPayerBalance - amount);
      expect(afterPaymentRecipientBalance).toBe(initialRecipientBalance + amount);

      // Step 2: Execute refund (recipient -> payer)
      // Recipient uses the tokens they received from the payment
      await executeRefund(paymentId, amount);

      // Verify final balances
      const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
      const finalRecipientBalance = await getTokenBalance(token.address, recipientAddress);

      // Payer recovered the refund amount
      expect(finalPayerBalance).toBe(afterPaymentPayerBalance + amount);

      // Recipient balance back to initial (payment received, then refunded)
      expect(finalRecipientBalance).toBe(initialRecipientBalance);

      // Verify on-chain state
      const gateway = getContract(gatewayAddress, PaymentGatewayABI);
      const isRefunded = await gateway.isPaymentRefunded(paymentId);
      expect(isRefunded).toBe(true);
    });
  });
});
