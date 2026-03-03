import { describe, it, expect, beforeAll } from 'vitest';
import { Wallet, Interface, solidityPackedKeccak256 } from 'ethers';
import {
  getWallet,
  getContract,
  getProvider,
  getTokenBalance,
  mintTokens,
  parseUnits,
  PaymentGatewayABI,
  ERC2771ForwarderABI,
} from '../helpers/blockchain';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES, TEST_CHAIN_ID } from '../setup/wallets';
import { getToken } from '../fixtures/token';
import {
  signPaymentRequest,
  signForwardRequest,
  getDeadline,
  generatePaymentId,
  type PaymentParams,
  type ForwardRequest,
} from '../helpers/signature';
import { createTestClient, TEST_MERCHANT, makeCreatePaymentParams } from '../helpers/sdk';

/**
 * EIP-2612 Permit Payment Integration Tests
 *
 * Tests the permit flow where token approval is done via signature
 * instead of a separate approve() transaction.
 *
 * Prerequisites:
 *   - Hardhat node running (port 8545)
 *   - Gateway API running (port 3001)
 */

const GATEWAY_BASE = (process.env.GATEWAY_URL || 'http://localhost:3001').replace(/\/$/, '');

const MOCK_ERC20_PERMIT_ABI = [
  'function name() view returns (string)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
];

describe('Permit Payment Flow', () => {
  const token = getToken('test');
  const payerPrivateKey = HARDHAT_ACCOUNTS.payer.privateKey;
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const signerPrivateKey = HARDHAT_ACCOUNTS.signer.privateKey;
  const recipientAddress = HARDHAT_ACCOUNTS.recipient.address;
  const gatewayAddress = CONTRACT_ADDRESSES.paymentGateway;
  const tokenAddress = CONTRACT_ADDRESSES.mockToken;

  let blockchainRunning = false;
  let gatewayRunning = false;

  // Permit domain info (populated in beforeAll)
  let tokenName: string;

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
   * Sign an EIP-2612 permit for the MockERC20 token.
   */
  async function signPermit(
    ownerPrivateKey: string,
    spender: string,
    value: bigint,
    permitDeadline: bigint,
    tokenAddr: string = tokenAddress
  ): Promise<{ deadline: bigint; v: number; r: string; s: string }> {
    const provider = getProvider();
    const wallet = new Wallet(ownerPrivateKey, provider);
    const tokenContract = getContract(tokenAddr, MOCK_ERC20_PERMIT_ABI);
    const nonce = await tokenContract.nonces(wallet.address);

    const domain = {
      name: tokenName,
      version: '1',
      chainId: TEST_CHAIN_ID,
      verifyingContract: tokenAddr,
    };

    const types = {
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    };

    const message = {
      owner: wallet.address,
      spender,
      value,
      nonce,
      deadline: permitDeadline,
    };

    const sig = await wallet.signTypedData(domain, types, message);
    const r = '0x' + sig.slice(2, 66);
    const s = '0x' + sig.slice(66, 130);
    const v = parseInt(sig.slice(130, 132), 16);

    return { deadline: permitDeadline, v, r, s };
  }

  beforeAll(async () => {
    try {
      const [bcOk, gwOk] = await Promise.all([checkBlockchain(), checkGateway()]);
      blockchainRunning = bcOk;
      gatewayRunning = gwOk;

      if (!bcOk) {
        console.warn('[permit-payment] Blockchain not running, tests will be skipped');
        return;
      }

      // Load token name for permit domain
      const tokenContract = getContract(tokenAddress, MOCK_ERC20_PERMIT_ABI);
      tokenName = await tokenContract.name();

      // Ensure payer has tokens
      const balance = await getTokenBalance(tokenAddress, payerAddress);
      if (balance < parseUnits('5000', token.decimals)) {
        await mintTokens(tokenAddress, payerAddress, parseUnits('50000', token.decimals));
      }
    } catch (err) {
      console.warn('[permit-payment] Setup failed:', err);
    }
  });

  describe('Direct payment with permit (no approve tx)', () => {
    it('should complete payment using EIP-2612 permit instead of approve', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('100', token.decimals);
      const orderId = `PERMIT_DIRECT_${Date.now()}`;
      const paymentId = generatePaymentId(orderId);

      const deadline = getDeadline(1);
      const paymentParams: PaymentParams = {
        paymentId,
        tokenAddress,
        amount,
        recipientAddress,
        merchantId: '0x' + '00'.repeat(32),
        deadline,
        escrowDuration: 86400n,
      };

      // Compute merchantId same as gateway does
      paymentParams.merchantId = solidityPackedKeccak256(['string'], ['merchant_demo_001']);

      const serverSignature = await signPaymentRequest(paymentParams, signerPrivateKey);

      // Sign permit instead of calling approve
      const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permit = await signPermit(payerPrivateKey, gatewayAddress, amount, permitDeadline);

      // Pay with permit (no prior approve call)
      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      const initialBalance = await getTokenBalance(tokenAddress, payerAddress);

      const tx = await gateway.pay(
        paymentId,
        tokenAddress,
        amount,
        recipientAddress,
        paymentParams.merchantId,
        deadline,
        86400n,
        serverSignature,
        permit
      );
      await tx.wait();

      // Verify payment processed
      const isProcessed = await gateway.isPaymentProcessed(paymentId);
      expect(isProcessed).toBe(true);

      // Verify balance decreased
      const finalBalance = await getTokenBalance(tokenAddress, payerAddress);
      expect(finalBalance).toBe(initialBalance - amount);
    });

    it('should fail payment when permit has expired deadline', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('50', token.decimals);
      const orderId = `PERMIT_EXPIRED_${Date.now()}`;
      const paymentId = generatePaymentId(orderId);

      const merchantId = solidityPackedKeccak256(['string'], ['merchant_demo_001']);
      const deadline = getDeadline(1);

      const serverSignature = await signPaymentRequest(
        {
          paymentId,
          tokenAddress,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          escrowDuration: 86400n,
        },
        signerPrivateKey
      );

      // Sign permit with expired deadline (1 second in the past)
      const expiredDeadline = BigInt(Math.floor(Date.now() / 1000) - 1);
      const permit = await signPermit(payerPrivateKey, gatewayAddress, amount, expiredDeadline);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      // Payment should revert because permit is expired and no prior approval exists
      // _tryPermit silently fails, then safeTransferFrom reverts due to no allowance
      await expect(
        gateway.pay(
          paymentId,
          tokenAddress,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          86400n,
          serverSignature,
          permit
        )
      ).rejects.toThrow();
    });

    it('should fail payment when permit is signed by wrong address', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('50', token.decimals);
      const orderId = `PERMIT_WRONG_SIGNER_${Date.now()}`;
      const paymentId = generatePaymentId(orderId);

      const merchantId = solidityPackedKeccak256(['string'], ['merchant_demo_001']);
      const deadline = getDeadline(1);

      const serverSignature = await signPaymentRequest(
        {
          paymentId,
          tokenAddress,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          escrowDuration: 86400n,
        },
        signerPrivateKey
      );

      // Sign permit with a different private key (recipient instead of payer)
      const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const wrongPermit = await signPermit(
        HARDHAT_ACCOUNTS.recipient.privateKey,
        gatewayAddress,
        amount,
        permitDeadline
      );

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(gatewayAddress, PaymentGatewayABI, wallet);

      // Permit signed by wrong address → _tryPermit silently fails → safeTransferFrom reverts
      await expect(
        gateway.pay(
          paymentId,
          tokenAddress,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          86400n,
          serverSignature,
          wrongPermit
        )
      ).rejects.toThrow();
    });
  });

  describe('Permit with Gateway API', () => {
    it('should return tokenPermitSupported flag in create payment response', async () => {
      if (!blockchainRunning || !gatewayRunning) return;

      const client = createTestClient(TEST_MERCHANT);
      const params = makeCreatePaymentParams(10);
      const response = await client.createPayment(params);

      expect(response.tokenPermitSupported).toBeDefined();
      expect(typeof response.tokenPermitSupported).toBe('boolean');
    });

    it('should complete payment via Gateway API + permit (no approve tx)', async () => {
      if (!blockchainRunning || !gatewayRunning) return;

      const client = createTestClient(TEST_MERCHANT);
      const amount = parseUnits('25', token.decimals);
      const createResponse = await client.createPayment(makeCreatePaymentParams(25));
      const paymentId = createResponse.paymentId;

      // Sign permit instead of calling approve
      const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permit = await signPermit(payerPrivateKey, gatewayAddress, amount, permitDeadline);

      const wallet = getWallet(payerPrivateKey);
      const gateway = getContract(createResponse.gatewayAddress, PaymentGatewayABI, wallet);

      const tx = await gateway.pay(
        paymentId,
        tokenAddress,
        amount,
        createResponse.recipientAddress,
        createResponse.merchantId,
        BigInt(createResponse.deadline),
        BigInt(createResponse.escrowDuration),
        createResponse.serverSignature,
        permit
      );
      await tx.wait();

      const isProcessed = await gateway.isPaymentProcessed(paymentId);
      expect(isProcessed).toBe(true);
    });
  });

  describe('Gasless payment with permit', () => {
    it('should complete gasless payment using permit (approve + pay in single meta-tx)', async () => {
      if (!blockchainRunning) return;

      const amount = parseUnits('30', token.decimals);
      const orderId = `PERMIT_GASLESS_${Date.now()}`;
      const paymentId = generatePaymentId(orderId);

      const merchantId = solidityPackedKeccak256(['string'], ['merchant_demo_001']);
      const deadline = getDeadline(1);

      const serverSignature = await signPaymentRequest(
        {
          paymentId,
          tokenAddress,
          amount,
          recipientAddress,
          merchantId,
          deadline,
          escrowDuration: 86400n,
        },
        signerPrivateKey
      );

      // Sign permit
      const permitDeadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
      const permit = await signPermit(payerPrivateKey, gatewayAddress, amount, permitDeadline);

      // Encode pay() with permit (not ZERO_PERMIT)
      const iface = new Interface(PaymentGatewayABI);
      const data = iface.encodeFunctionData('pay', [
        paymentId,
        tokenAddress,
        amount,
        recipientAddress,
        merchantId,
        deadline,
        86400n,
        serverSignature,
        permit,
      ]);

      // Build ForwardRequest
      const forwarderAddress = CONTRACT_ADDRESSES.forwarder;
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

      const forwardSignature = await signForwardRequest(request, payerPrivateKey);

      // Submit via relayer
      const relayerWallet = getWallet(HARDHAT_ACCOUNTS.relayer.privateKey);
      const forwarderAsRelayer = getContract(forwarderAddress, ERC2771ForwarderABI, relayerWallet);

      const requestData = {
        from: request.from,
        to: request.to,
        value: request.value,
        gas: request.gas,
        deadline: request.deadline,
        data: request.data,
        signature: forwardSignature,
      };

      const tx = await forwarderAsRelayer.execute(requestData);
      await tx.wait();

      // Verify
      const gateway = getContract(gatewayAddress, PaymentGatewayABI);
      const isProcessed = await gateway.isPaymentProcessed(paymentId);
      expect(isProcessed).toBe(true);
    });
  });
});
