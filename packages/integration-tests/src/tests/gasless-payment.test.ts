import { describe, it, expect, beforeAll } from 'vitest';
import {
  getWallet,
  getContract,
  getTokenBalance,
  approveToken,
  mintTokens,
  parseUnits,
  PaymentGatewayABI,
  ERC2771ForwarderABI,
} from '../helpers/blockchain';
import {
  signForwardRequest,
  signPaymentRequest,
  signFinalizeRequest,
  encodePayFunctionData,
  generatePaymentId,
  merchantKeyToId,
  getDeadline,
  DEFAULT_ESCROW_DURATION,
  type ForwardRequest,
  type PaymentParams,
} from '../helpers/signature';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES } from '../setup/wallets';
import { getToken } from '../fixtures/token';

describe('Gasless Payment Integration', () => {
  const token = getToken('mockUSDT');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const relayerPrivateKey = HARDHAT_ACCOUNTS.relayer.privateKey;
  const signerPrivateKey = HARDHAT_ACCOUNTS.signer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  // Treasury receives platform fees (Account #5 - contract config)
  const treasuryAddress = HARDHAT_ACCOUNTS.treasury.address;
  // Recipient receives payments (Account #1 - matches init.sql)
  const recipientAddress = HARDHAT_ACCOUNTS.recipient.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;
  const forwarderAddress = CONTRACT_ADDRESSES.forwarder;

  // Test merchant ID
  const merchantKey = 'merchant_demo_001';
  const merchantId = merchantKeyToId(merchantKey);

  beforeAll(async () => {
    const balance = await getTokenBalance(token.address, payerAddress);
    if (balance < parseUnits('1000', token.decimals)) {
      await mintTokens(token.address, payerAddress, parseUnits('10000', token.decimals));
    }
  });

  async function getNonce(address: string): Promise<bigint> {
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI);
    return forwarder.nonces(address);
  }

  it('should complete a gasless payment via forwarder with no fee (escrow + finalize)', async () => {
    const paymentId = generatePaymentId(`ORDER_GASLESS_${Date.now()}`);
    const amount = parseUnits('100', token.decimals);
    const feeBps = 0;

    const initialPayerBalance = await getTokenBalance(token.address, payerAddress);
    const initialRecipientBalance = await getTokenBalance(token.address, recipientAddress);

    // Create server signature
    const paymentDeadline = getDeadline(1);
    const paymentParams: PaymentParams = {
      paymentId,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    const data = encodePayFunctionData(
      paymentId,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline,
      DEFAULT_ESCROW_DURATION,
      serverSignature
    );
    const nonce = await getNonce(payerAddress);
    const deadline = getDeadline(1);

    const request: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline,
      data,
    };

    const signature = await signForwardRequest(request, payerPrivateKey);

    const relayerWallet = getWallet(relayerPrivateKey);
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

    // OZ v5 ForwardRequestData struct (includes signature, excludes nonce)
    const requestData = {
      from: request.from,
      to: request.to,
      value: request.value,
      gas: request.gas,
      deadline: request.deadline,
      data: request.data,
      signature,
    };

    const tx = await forwarder.execute(requestData);
    await tx.wait();

    const gateway = getContract(gatewayAddress, PaymentGatewayABI);
    const isProcessed = await gateway.isPaymentProcessed(paymentId);
    expect(isProcessed).toBe(true);

    // Finalize to release funds
    const signerWallet = getWallet(signerPrivateKey);
    const gatewayWithSigner = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
    const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
    const finalizeTx = await gatewayWithSigner.finalize(paymentId, finalizeSignature);
    await finalizeTx.wait();

    const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
    const finalRecipientBalance = await getTokenBalance(token.address, recipientAddress);

    expect(finalPayerBalance).toBe(initialPayerBalance - amount);
    expect(finalRecipientBalance).toBe(initialRecipientBalance + amount);
  });

  it('should complete a gasless payment with fee split', async () => {
    const paymentId = generatePaymentId(`ORDER_GASLESS_FEE_${Date.now()}`);
    const amount = parseUnits('100', token.decimals);
    const feeBps = 500; // 5%

    const initialPayerBalance = await getTokenBalance(token.address, payerAddress);
    const initialTreasuryBalance = await getTokenBalance(token.address, treasuryAddress);
    const initialRecipientBalance = await getTokenBalance(token.address, recipientAddress);

    // Create server signature with fee
    const paymentDeadline = getDeadline(1);
    const paymentParams: PaymentParams = {
      paymentId,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    const data = encodePayFunctionData(
      paymentId,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline,
      DEFAULT_ESCROW_DURATION,
      serverSignature
    );
    const nonce = await getNonce(payerAddress);
    const deadline = getDeadline(1);

    const request: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline,
      data,
    };

    const signature = await signForwardRequest(request, payerPrivateKey);

    const relayerWallet = getWallet(relayerPrivateKey);
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

    const requestData = {
      from: request.from,
      to: request.to,
      value: request.value,
      gas: request.gas,
      deadline: request.deadline,
      data: request.data,
      signature,
    };

    const tx = await forwarder.execute(requestData);
    await tx.wait();

    // Finalize to release funds with fee split
    const signerWallet = getWallet(signerPrivateKey);
    const gatewayWithSigner = getContract(gatewayAddress, PaymentGatewayABI, signerWallet);
    const finalizeSignature = await signFinalizeRequest(paymentId, signerPrivateKey);
    const finalizeTx = await gatewayWithSigner.finalize(paymentId, finalizeSignature);
    await finalizeTx.wait();

    const expectedFee = (amount * BigInt(feeBps)) / 10000n;
    const expectedRecipientAmount = amount - expectedFee;

    const finalPayerBalance = await getTokenBalance(token.address, payerAddress);
    const finalTreasuryBalance = await getTokenBalance(token.address, treasuryAddress);
    const finalRecipientBalance = await getTokenBalance(token.address, recipientAddress);

    expect(finalPayerBalance).toBe(initialPayerBalance - amount);
    expect(finalTreasuryBalance).toBe(initialTreasuryBalance + expectedFee);
    expect(finalRecipientBalance).toBe(initialRecipientBalance + expectedRecipientAmount);
  });

  it('should reject expired deadline', async () => {
    const paymentId = generatePaymentId(`ORDER_EXPIRED_${Date.now()}`);
    const amount = parseUnits('50', token.decimals);
    const feeBps = 0;

    // Create server signature
    const paymentDeadline = getDeadline(1);
    const paymentParams: PaymentParams = {
      paymentId,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    const data = encodePayFunctionData(
      paymentId,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline,
      DEFAULT_ESCROW_DURATION,
      serverSignature
    );
    const nonce = await getNonce(payerAddress);
    const expiredDeadline = BigInt(Math.floor(Date.now() / 1000) - 3600);

    const request: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline: expiredDeadline,
      data,
    };

    const signature = await signForwardRequest(request, payerPrivateKey);

    const relayerWallet = getWallet(relayerPrivateKey);
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

    const requestData = {
      from: request.from,
      to: request.to,
      value: request.value,
      gas: request.gas,
      deadline: request.deadline,
      data: request.data,
      signature,
    };

    await expect(forwarder.execute(requestData)).rejects.toThrow();
  });

  it('should reject invalid forwarder signature', async () => {
    const paymentId = generatePaymentId(`ORDER_INVALID_FWD_SIG_${Date.now()}`);
    const amount = parseUnits('50', token.decimals);
    const feeBps = 0;

    // Create server signature
    const paymentDeadline = getDeadline(1);
    const paymentParams: PaymentParams = {
      paymentId,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    const data = encodePayFunctionData(
      paymentId,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline,
      DEFAULT_ESCROW_DURATION,
      serverSignature
    );
    const nonce = await getNonce(payerAddress);
    const deadline = getDeadline(1);

    const request: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline,
      data,
    };

    // Sign with wrong key (relayer instead of payer)
    const wrongSignature = await signForwardRequest(request, relayerPrivateKey);

    const relayerWallet = getWallet(relayerPrivateKey);
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

    const requestData = {
      from: request.from,
      to: request.to,
      value: request.value,
      gas: request.gas,
      deadline: request.deadline,
      data: request.data,
      signature: wrongSignature,
    };

    await expect(forwarder.execute(requestData)).rejects.toThrow();
  });

  it('should reject replay attack (same nonce)', async () => {
    const paymentId1 = generatePaymentId(`ORDER_REPLAY_1_${Date.now()}`);
    const paymentId2 = generatePaymentId(`ORDER_REPLAY_2_${Date.now()}`);
    const amount = parseUnits('25', token.decimals);
    const feeBps = 0;

    await approveToken(token.address, gatewayAddress, amount * 2n, payerPrivateKey);

    const nonce = await getNonce(payerAddress);
    const deadline = getDeadline(1);

    // First transaction - create server signature
    const paymentDeadline1 = getDeadline(1);
    const paymentParams1: PaymentParams = {
      paymentId: paymentId1,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline1,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const serverSignature1 = await signPaymentRequest(paymentParams1, signerPrivateKey);

    const data1 = encodePayFunctionData(
      paymentId1,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline1,
      DEFAULT_ESCROW_DURATION,
      serverSignature1
    );
    const request1: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline,
      data: data1,
    };
    const signature1 = await signForwardRequest(request1, payerPrivateKey);

    const relayerWallet = getWallet(relayerPrivateKey);
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

    const requestData1 = {
      from: request1.from,
      to: request1.to,
      value: request1.value,
      gas: request1.gas,
      deadline: request1.deadline,
      data: request1.data,
      signature: signature1,
    };

    const tx = await forwarder.execute(requestData1);
    await tx.wait();

    // Second transaction with same nonce (replay attack)
    const paymentDeadline2 = getDeadline(1);
    const paymentParams2: PaymentParams = {
      paymentId: paymentId2,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline2,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const serverSignature2 = await signPaymentRequest(paymentParams2, signerPrivateKey);

    const data2 = encodePayFunctionData(
      paymentId2,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline2,
      DEFAULT_ESCROW_DURATION,
      serverSignature2
    );
    const request2: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce, // Same nonce as first transaction
      deadline,
      data: data2,
    };
    const signature2 = await signForwardRequest(request2, payerPrivateKey);

    const requestData2 = {
      from: request2.from,
      to: request2.to,
      value: request2.value,
      gas: request2.gas,
      deadline: request2.deadline,
      data: request2.data,
      signature: signature2,
    };

    await expect(forwarder.execute(requestData2)).rejects.toThrow();
  });

  it('should reject invalid server signature in gasless payment', async () => {
    const paymentId = generatePaymentId(`ORDER_GASLESS_INVALID_SERVER_${Date.now()}`);
    const amount = parseUnits('50', token.decimals);
    const feeBps = 0;

    // Create server signature with wrong key (relayer instead of signer)
    const paymentDeadline = getDeadline(1);
    const paymentParams: PaymentParams = {
      paymentId,
      tokenAddress: token.address,
      amount,
      recipientAddress: recipientAddress,
      merchantId,
      feeBps,
      deadline: paymentDeadline,
      escrowDuration: DEFAULT_ESCROW_DURATION,
    };
    const wrongServerSignature = await signPaymentRequest(
      paymentParams,
      HARDHAT_ACCOUNTS.relayer.privateKey
    );

    await approveToken(token.address, gatewayAddress, amount, payerPrivateKey);

    const data = encodePayFunctionData(
      paymentId,
      token.address,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      paymentDeadline,
      DEFAULT_ESCROW_DURATION,
      wrongServerSignature
    );
    const nonce = await getNonce(payerAddress);
    const deadline = getDeadline(1);

    const request: ForwardRequest = {
      from: payerAddress,
      to: gatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline,
      data,
    };

    const signature = await signForwardRequest(request, payerPrivateKey);

    const relayerWallet = getWallet(relayerPrivateKey);
    const forwarder = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

    const requestData = {
      from: request.from,
      to: request.to,
      value: request.value,
      gas: request.gas,
      deadline: request.deadline,
      data: request.data,
      signature,
    };

    await expect(forwarder.execute(requestData)).rejects.toThrow();
  });
});
