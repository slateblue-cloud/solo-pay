/**
 * Payment API Client
 * Handles create payment and gasless relay submission
 */

import { JsonRpcProvider, Wallet, Contract, Interface, parseUnits, Signature } from 'ethers';
import type { NetworkConfig } from '../../config';
import type { TestAccount } from '../account-manager';

// ABIs
const ERC20_PERMIT_ABI = [
  'function nonces(address owner) external view returns (uint256)',
  'function name() external view returns (string)',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
];

const FORWARDER_ABI = ['function nonces(address owner) external view returns (uint256)'];

const PAYMENT_GATEWAY_ABI = [
  'function pay(bytes32 paymentId, address tokenAddress, uint256 amount, address recipientAddress, bytes32 merchantId, uint16 feeBps, uint256 deadline, uint256 escrowDuration, bytes calldata serverSignature, tuple(uint256 deadline, uint8 v, bytes32 r, bytes32 s) permit) external',
];

// EIP-2612 Permit types
const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// EIP-712 Types
const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'gas', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint48' },
    { name: 'data', type: 'bytes' },
  ],
};

export interface CreatePaymentResponse {
  success: boolean;
  paymentId: string; // This is the payment hash (bytes32)
  orderId: string;
  amount: string;
  tokenAddress: string;
  recipientAddress: string;
  merchantId: string;
  feeBps: number;
  deadline: string;
  escrowDuration: string;
  serverSignature: string;
  expiresAt: string;
  gatewayAddress: string;
  forwarderAddress: string;
  chainId: number;
  tokenDecimals: number;
  tokenSymbol: string;
}

export interface RelayResponse {
  success: boolean;
  status: string;
  message: string;
}

export interface PaymentResult {
  walletIndex: number;
  walletAddress: string;
  orderId: string;
  paymentHash?: string;
  success: boolean;
  error?: string;
  durationMs: number;
  steps: {
    createPayment?: { success: boolean; durationMs: number };
    approve?: { success: boolean; durationMs: number };
    signAndRelay?: { success: boolean; durationMs: number };
    confirm?: { success: boolean; durationMs: number; finalStatus?: string };
  };
}

/**
 * Create payment via Gateway API
 */
async function createPayment(
  config: NetworkConfig,
  orderId: string,
  amount: string
): Promise<CreatePaymentResponse> {
  const response = await fetch(`${config.gatewayUrl}/api/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-public-key': config.merchantPublicKey,
      Origin: config.merchantOrigin,
    },
    body: JSON.stringify({
      orderId,
      amount: parseFloat(amount),
      tokenAddress: config.tokenAddress,
      successUrl: 'https://example.com/success',
      failUrl: 'https://example.com/fail',
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({ message: 'Unknown error' }))) as {
      message?: string;
      code?: string;
      details?: unknown;
    };
    throw new Error(
      `Create payment failed: ${errorData.message || response.statusText} (code: ${errorData.code || 'UNKNOWN'})`
    );
  }

  return response.json() as Promise<CreatePaymentResponse>;
}

export interface PermitSignature {
  deadline: bigint;
  v: number;
  r: string;
  s: string;
}

/**
 * Sign EIP-2612 Permit for token approval (gasless)
 */
async function signPermit(
  wallet: Wallet,
  config: NetworkConfig,
  spender: string,
  amount: bigint,
  deadline: bigint
): Promise<PermitSignature> {
  const token = new Contract(config.tokenAddress, ERC20_PERMIT_ABI, wallet);

  // Get token nonce for permit
  const nonce = await token.nonces(wallet.address);
  const tokenName = await token.name();

  // EIP-2612 domain
  const domain = {
    name: tokenName,
    version: '1',
    chainId: config.chainId,
    verifyingContract: config.tokenAddress,
  };

  const message = {
    owner: wallet.address,
    spender,
    value: amount,
    nonce,
    deadline,
  };

  const signature = await wallet.signTypedData(domain, PERMIT_TYPES, message);

  // Split signature into v, r, s
  const sig = Signature.from(signature);

  return {
    deadline,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

/**
 * Get forwarder nonce for an address
 */
async function getForwarderNonce(
  provider: JsonRpcProvider,
  config: NetworkConfig,
  address: string
): Promise<bigint> {
  const forwarder = new Contract(config.forwarderAddress, FORWARDER_ABI, provider);
  return forwarder.nonces(address);
}

/**
 * Encode pay function data with permit
 */
function encodePayData(payment: CreatePaymentResponse, permit: PermitSignature): string {
  const iface = new Interface(PAYMENT_GATEWAY_ABI);

  return iface.encodeFunctionData('pay', [
    payment.paymentId, // paymentId is the bytes32 hash
    payment.tokenAddress,
    BigInt(payment.amount),
    payment.recipientAddress,
    payment.merchantId,
    payment.feeBps,
    BigInt(payment.deadline ?? Math.floor(Date.now() / 1000) + 3600),
    BigInt(payment.escrowDuration ?? 86400),
    payment.serverSignature,
    {
      deadline: permit.deadline,
      v: permit.v,
      r: permit.r,
      s: permit.s,
    },
  ]);
}

/**
 * Sign ForwardRequest with EIP-712
 */
async function signForwardRequest(
  wallet: Wallet,
  config: NetworkConfig,
  request: {
    from: string;
    to: string;
    value: bigint;
    gas: bigint;
    nonce: bigint;
    deadline: bigint;
    data: string;
  }
): Promise<string> {
  const domain = {
    name: 'SoloForwarder',
    version: '1',
    chainId: config.chainId,
    verifyingContract: config.forwarderAddress,
  };

  return wallet.signTypedData(domain, FORWARD_REQUEST_TYPES, {
    from: request.from,
    to: request.to,
    value: request.value,
    gas: request.gas,
    nonce: request.nonce,
    deadline: request.deadline,
    data: request.data,
  });
}

/**
 * Submit gasless relay request
 */
async function submitRelay(
  config: NetworkConfig,
  paymentId: string,
  forwardRequest: {
    from: string;
    to: string;
    value: string;
    gas: string;
    nonce: string;
    deadline: string;
    data: string;
  },
  signature: string
): Promise<RelayResponse> {
  const response = await fetch(`${config.gatewayUrl}/api/v1/payments/${paymentId}/relay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-public-key': config.merchantPublicKey,
      Origin: config.merchantOrigin,
    },
    body: JSON.stringify({
      paymentId, // Include in body as schema expects
      forwarderAddress: config.forwarderAddress,
      forwardRequest: {
        from: forwardRequest.from,
        to: forwardRequest.to,
        value: forwardRequest.value,
        gas: forwardRequest.gas,
        nonce: forwardRequest.nonce,
        deadline: forwardRequest.deadline,
        data: forwardRequest.data,
        signature,
      },
    }),
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({ message: 'Unknown error' }))) as {
      message?: string;
      code?: string;
      details?: unknown;
    };
    const details = errorData.details ? ` Details: ${JSON.stringify(errorData.details)}` : '';
    throw new Error(
      `Relay failed: ${errorData.message || response.statusText} (code: ${errorData.code || 'UNKNOWN'})${details}`
    );
  }

  return response.json() as Promise<RelayResponse>;
}

const CONFIRM_POLL_INTERVAL_MS = 3000;
const CONFIRM_TIMEOUT_MS = 120_000;
// Terminal statuses: payment flow is complete (no further action needed for stress test)
// ESCROWED: payment successful and held in escrow (merchant can finalize later)
// FINALIZED: payment finalized (escrow released to merchant)
// CONFIRMED: payment confirmed (for backwards compatibility / direct payment without escrow)
const TERMINAL_STATUSES = ['ESCROWED', 'FINALIZED', 'CONFIRMED', 'FAILED', 'EXPIRED'];

interface PaymentStatusResponse {
  success: boolean;
  data: {
    status: string;
    transactionHash?: string;
    [key: string]: unknown;
  };
}

/**
 * Poll GET /payments/:id until status reaches a terminal state (ESCROWED, FINALIZED, CONFIRMED, FAILED, EXPIRED)
 */
async function pollPaymentStatus(
  config: NetworkConfig,
  paymentId: string,
  timeoutMs: number = CONFIRM_TIMEOUT_MS,
  intervalMs: number = CONFIRM_POLL_INTERVAL_MS
): Promise<{ status: string; durationMs: number }> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const response = await fetch(`${config.gatewayUrl}/api/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'x-public-key': config.merchantPublicKey,
        'x-origin': config.merchantOrigin,
      },
    });

    if (response.ok) {
      const body = (await response.json()) as PaymentStatusResponse;
      const status = body.data?.status;

      if (status && TERMINAL_STATUSES.includes(status)) {
        return { status, durationMs: Date.now() - start };
      }
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  return { status: 'TIMEOUT', durationMs: Date.now() - start };
}

/**
 * Execute full payment flow for a single wallet
 */
export async function executePayment(
  testWallet: TestAccount,
  config: NetworkConfig,
  paymentAmount: string
): Promise<PaymentResult> {
  const startTime = Date.now();
  const orderId = `stress_${Date.now()}_${testWallet.index}_${Math.random().toString(36).slice(2, 8)}`;

  const result: PaymentResult = {
    walletIndex: testWallet.index,
    walletAddress: testWallet.address,
    orderId,
    success: false,
    durationMs: 0,
    steps: {},
  };

  const provider = new JsonRpcProvider(config.rpcUrl);
  const wallet = new Wallet(testWallet.privateKey, provider);
  const amount = parseUnits(paymentAmount, config.tokenDecimals);

  try {
    // Step 1: Create Payment
    const createStart = Date.now();
    const payment = await createPayment(config, orderId, paymentAmount);
    result.paymentHash = payment.paymentId; // paymentId IS the payment hash
    result.steps.createPayment = {
      success: true,
      durationMs: Date.now() - createStart,
    };

    // Step 2: Sign Permit
    const permitStart = Date.now();
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
    const permit = await signPermit(wallet, config, config.paymentGatewayAddress, amount, deadline);
    result.steps.approve = {
      success: true,
      durationMs: Date.now() - permitStart,
    };

    // Step 3: Sign ForwardRequest and Relay
    const relayStart = Date.now();

    const nonce = await getForwarderNonce(provider, config, wallet.address);
    const data = encodePayData(payment, permit);

    const forwardRequest = {
      from: wallet.address,
      to: config.paymentGatewayAddress,
      value: 0n,
      gas: 500000n,
      nonce,
      deadline,
      data,
    };

    const signature = await signForwardRequest(wallet, config, forwardRequest);

    await submitRelay(
      config,
      payment.paymentId,
      {
        from: forwardRequest.from,
        to: forwardRequest.to,
        value: forwardRequest.value.toString(),
        gas: forwardRequest.gas.toString(),
        nonce: forwardRequest.nonce.toString(),
        deadline: forwardRequest.deadline.toString(),
        data: forwardRequest.data,
      },
      signature
    );

    result.steps.signAndRelay = {
      success: true,
      durationMs: Date.now() - relayStart,
    };

    // Step 4: Poll for on-chain confirmation (wait for ESCROWED)
    const confirmResult = await pollPaymentStatus(config, payment.paymentId);

    // ESCROWED is success for user payment flow (merchant will finalize later)
    const successStatuses = ['ESCROWED', 'FINALIZED', 'CONFIRMED'];
    const isSuccess = successStatuses.includes(confirmResult.status);

    result.steps.confirm = {
      success: isSuccess,
      durationMs: confirmResult.durationMs,
      finalStatus: confirmResult.status,
    };

    if (!isSuccess) {
      throw new Error(
        `Payment failed: status=${confirmResult.status} after ${confirmResult.durationMs}ms`
      );
    }

    // Success! ESCROWED means user payment is complete (tokens held in escrow).
    // Merchant finalize is a separate flow tested elsewhere.
    result.success = true;
  } catch (error) {
    result.error = error instanceof Error ? error.message : 'Unknown error';
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

/**
 * Execute payments in parallel with concurrency limit
 */
export async function executePaymentsParallel(
  wallets: TestAccount[],
  config: NetworkConfig,
  paymentAmount: string,
  concurrency: number,
  onProgress?: (completed: number, total: number, result: PaymentResult) => void
): Promise<PaymentResult[]> {
  const results: PaymentResult[] = [];
  let completedCount = 0;

  // Process in batches
  for (let i = 0; i < wallets.length; i += concurrency) {
    const batch = wallets.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((wallet) => executePayment(wallet, config, paymentAmount))
    );

    for (const result of batchResults) {
      results.push(result);
      completedCount++;
      onProgress?.(completedCount, wallets.length, result);
    }
  }

  return results;
}
