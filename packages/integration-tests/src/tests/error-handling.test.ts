import { describe, it, expect, beforeAll } from 'vitest';
import { ethers } from 'ethers';
import {
  getWallet,
  getContract,
  getTokenBalance,
  approveToken,
  mintTokens,
  parseUnits,
  PaymentGatewayABI,
} from '../helpers/blockchain';
import {
  generatePaymentId,
  signPaymentRequest,
  merchantKeyToId,
  getDeadline,
  ZERO_PERMIT,
  DEFAULT_ESCROW_DURATION,
  type PaymentParams,
} from '../helpers/signature';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES } from '../setup/wallets';
import { getToken } from '../fixtures/token';

describe('Error Handling Integration', () => {
  const token = getToken('mockUSDT');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const signerPrivateKey = HARDHAT_ACCOUNTS.signer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  // Recipient receives payments (Account #1 - matches init.sql)
  const recipientAddress = HARDHAT_ACCOUNTS.recipient.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;

  // Test merchant ID
  const merchantKey = 'merchant_demo_001';
  const merchantId = merchantKeyToId(merchantKey);

  beforeAll(async () => {
    const balance = await getTokenBalance(token.address, payerAddress);
    if (balance < parseUnits('1000', token.decimals)) {
      await mintTokens(token.address, payerAddress, parseUnits('10000', token.decimals));
    }
  });

  describe('Invalid Payment Parameters', () => {
    it('should reject zero amount', async () => {
      const paymentId = generatePaymentId(`ERROR_ZERO_AMOUNT_${Date.now()}`);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount: 0n,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(
        gateway.pay(
          paymentId,
          token.address,
          0n,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });

    it('should reject zero token address', async () => {
      const paymentId = generatePaymentId(`ERROR_ZERO_TOKEN_${Date.now()}`);
      const amount = parseUnits('10', token.decimals);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: ethers.ZeroAddress,
        amount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(
        gateway.pay(
          paymentId,
          ethers.ZeroAddress,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });
  });

  describe('Token Approval Errors', () => {
    it('should reject payment without approval', async () => {
      const paymentId = generatePaymentId(`ERROR_NO_APPROVAL_${Date.now()}`);
      const amount = parseUnits('1000000', token.decimals);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(
        gateway.pay(
          paymentId,
          token.address,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });

    it('should reject payment with insufficient approval', async () => {
      const paymentId = generatePaymentId(`ERROR_LOW_APPROVAL_${Date.now()}`);
      const approvalAmount = parseUnits('50', token.decimals);
      const paymentAmount = parseUnits('100', token.decimals);

      await approveToken(token.address, gatewayAddress, approvalAmount, payerPrivateKey);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount: paymentAmount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(
        gateway.pay(
          paymentId,
          token.address,
          paymentAmount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });
  });

  describe('Balance Errors', () => {
    it('should reject payment exceeding balance', async () => {
      const paymentId = generatePaymentId(`ERROR_EXCEED_BALANCE_${Date.now()}`);
      const balance = await getTokenBalance(token.address, payerAddress);
      const amount = balance + parseUnits('1', token.decimals);

      await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(
        gateway.pay(
          paymentId,
          token.address,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });
  });

  describe('Duplicate Payment Errors', () => {
    it('should reject duplicate payment ID', async () => {
      const paymentId = generatePaymentId(`ERROR_DUPLICATE_${Date.now()}`);
      const amount = parseUnits('10', token.decimals);

      await approveToken(token.address, gatewayAddress, amount * 2n, payerPrivateKey);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      const tx = await gateway.pay(
        paymentId,
        token.address,
        amount,
        recipientAddress,
        merchantId,
        deadline,
        DEFAULT_ESCROW_DURATION,
        serverSignature,
        ZERO_PERMIT
      );
      await tx.wait();

      await expect(
        gateway.pay(
          paymentId,
          token.address,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });
  });

  describe('Signature Errors', () => {
    it('should reject invalid server signature', async () => {
      const paymentId = generatePaymentId(`ERROR_INVALID_SIG_${Date.now()}`);
      const amount = parseUnits('10', token.decimals);

      await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

      // Sign with wrong key (relayer instead of signer)
      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const wrongSignature = await signPaymentRequest(
        paymentParams,
        HARDHAT_ACCOUNTS.relayer.privateKey
      );

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      await expect(
        gateway.pay(
          paymentId,
          token.address,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          wrongSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });

    it('should reject tampered amount in payment', async () => {
      const paymentId = generatePaymentId(`ERROR_TAMPERED_AMOUNT_${Date.now()}`);
      const signedAmount = parseUnits('10', token.decimals);
      const tamperedAmount = parseUnits('100', token.decimals);

      await approveToken(token.address, gatewayAddress, tamperedAmount, payerPrivateKey);

      // Sign with original amount
      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress: token.address,
        amount: signedAmount,
        recipientAddress: recipientAddress,
        merchantId,
        deadline,
        escrowDuration: DEFAULT_ESCROW_DURATION,
      };
      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      // Try to pay with tampered amount
      await expect(
        gateway.pay(
          paymentId,
          token.address,
          tamperedAmount,
          recipientAddress,
          merchantId,
          deadline,
          DEFAULT_ESCROW_DURATION,
          serverSignature,
          ZERO_PERMIT
        )
      ).rejects.toThrow();
    });
  });
});
