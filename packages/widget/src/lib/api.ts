import getConfig from 'next/config';
import type { WidgetUrlParams, PaymentDetails } from '../types';

// ============================================================================
// Configuration
// ============================================================================

/** Base path for gateway API v1 (must match gateway mount). */
const API_V1_BASE_PATH = '/api/v1';

function getGatewayApiBase(): string {
  const { publicRuntimeConfig } = getConfig() || {};
  const url = (publicRuntimeConfig?.gatewayApiUrl || 'http://localhost:3001').replace(/\/$/, '');
  return `${url}${API_V1_BASE_PATH}`;
}

function getFaucetApiUrl(): string {
  const { publicRuntimeConfig } = getConfig() || {};
  return (publicRuntimeConfig?.faucetApiUrl || 'http://localhost:3003').replace(/\/$/, '');
}

// ============================================================================
// Error Handling
// ============================================================================

export class PaymentApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number,
    public details?: Array<{ field?: string; message: string }>
  ) {
    super(message);
    this.name = 'PaymentApiError';
  }
}

interface ErrorResponse {
  code: string;
  message: string;
  details?: Array<{ field?: string; message: string }>;
}

// ============================================================================
// API Types
// ============================================================================

export interface CreatePaymentRequest {
  orderId: string;
  amount: number;
  tokenAddress: string;
  successUrl: string;
  failUrl: string;
  currency?: string;
}

export interface CreatePaymentResponse extends PaymentDetails {}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Create a payment (POST /payments).
 * Auth: x-public-key header. Origin is verified by the browser automatically.
 */
export async function createPayment(
  publicKey: string,
  params: CreatePaymentRequest
): Promise<CreatePaymentResponse> {
  const apiBase = getGatewayApiBase();

  const response = await fetch(`${apiBase}/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-public-key': publicKey,
    },
    body: JSON.stringify(params),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new PaymentApiError(
      error.code || 'UNKNOWN_ERROR',
      error.message || 'Failed to create payment',
      response.status,
      error.details
    );
  }

  if (data && typeof data === 'object' && 'success' in data) {
    const { success: _success, ...rest } = data as Record<string, unknown>;
    return rest as unknown as CreatePaymentResponse;
  }

  return data as CreatePaymentResponse;
}

/**
 * Create payment from validated URL parameters.
 */
export async function createPaymentFromUrlParams(
  urlParams: WidgetUrlParams
): Promise<CreatePaymentResponse> {
  return createPayment(urlParams.pk, {
    orderId: urlParams.orderId,
    amount: parseFloat(urlParams.amount),
    tokenAddress: urlParams.tokenAddress,
    successUrl: urlParams.successUrl,
    failUrl: urlParams.failUrl,
    ...(urlParams.currency ? { currency: urlParams.currency } : {}),
  });
}

// ============================================================================
// Payment Details (Resume Mode)
// ============================================================================

/**
 * Get full payment details by paymentId (GET /payments/:id).
 * Used to resume a payment flow after page refresh or when opening
 * a widget link with only pk and paymentId.
 */
export async function getPaymentDetails(
  paymentId: string,
  publicKey: string
): Promise<PaymentDetails> {
  const apiBase = getGatewayApiBase();

  const response = await fetch(`${apiBase}/payments/${paymentId}`, {
    headers: { 'x-public-key': publicKey },
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new PaymentApiError(
      error.code || 'UNKNOWN_ERROR',
      error.message || 'Failed to get payment details',
      response.status,
      error.details
    );
  }

  if (data && data.success === true && data.data) {
    return data.data as PaymentDetails;
  }

  return data as PaymentDetails;
}

// ============================================================================
// Payment Status
// ============================================================================

export interface PaymentStatusResponse {
  paymentId: string;
  status: 'PENDING' | 'PROCESSING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  txHash?: string;
  confirmedAt?: string;
}

export interface GetPaymentStatusOptions {
  publicKey?: string;
}

/**
 * Get payment status (GET /payments/:id).
 */
export async function getPaymentStatus(
  paymentId: string,
  options?: GetPaymentStatusOptions
): Promise<PaymentStatusResponse> {
  const apiBase = getGatewayApiBase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.publicKey) headers['x-public-key'] = options.publicKey;

  const response = await fetch(`${apiBase}/payments/${paymentId}`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new PaymentApiError(
      error.code || 'UNKNOWN_ERROR',
      error.message || 'Failed to get payment status',
      response.status,
      error.details
    );
  }

  if (data && data.success === true && data.data) {
    const d = data.data as {
      status: string;
      payment_hash?: string;
      paymentId?: string;
      transactionHash?: string;
      txHash?: string;
      confirmedAt?: string;
    };
    return {
      paymentId: d.payment_hash ?? d.paymentId ?? paymentId,
      status: d.status as PaymentStatusResponse['status'],
      txHash: d.transactionHash ?? d.txHash,
      confirmedAt: d.confirmedAt,
    };
  }

  return data as PaymentStatusResponse;
}

/**
 * Poll payment status until completion or timeout.
 */
export async function pollPaymentStatus(
  paymentId: string,
  options: {
    maxAttempts?: number;
    intervalMs?: number;
    onStatusChange?: (status: PaymentStatusResponse) => void;
    publicKey?: string;
  } = {}
): Promise<PaymentStatusResponse> {
  const { maxAttempts = 30, intervalMs = 2000, onStatusChange, publicKey } = options;
  const statusOptions = publicKey !== undefined ? { publicKey } : undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const status = await getPaymentStatus(paymentId, statusOptions);

    onStatusChange?.(status);

    if (status.status === 'CONFIRMED') {
      return status;
    }

    if (status.status === 'FAILED' || status.status === 'EXPIRED') {
      throw new PaymentApiError(
        `PAYMENT_${status.status}`,
        `Payment ${status.status.toLowerCase()}`,
        400
      );
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new PaymentApiError('TIMEOUT', 'Payment confirmation timeout', 408);
}

// ============================================================================
// Request Gas (Faucet)
// ============================================================================

export interface RequestGasResponse {
  txHash: string;
  amount: string;
  chainId: number;
}

/**
 * Request one-time gas grant for approve. Requires public key.
 */
export async function requestGas(
  publicKey: string,
  paymentId: string,
  walletAddress: string
): Promise<RequestGasResponse> {
  const apiUrl = getFaucetApiUrl();

  const response = await fetch(`${apiUrl}/payments/request-gas`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-public-key': publicKey,
    },
    body: JSON.stringify({ paymentId, walletAddress }),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new PaymentApiError(
      error.code || 'REQUEST_GAS_ERROR',
      error.message || 'Failed to request gas',
      response.status,
      error.details
    );
  }

  return data as RequestGasResponse;
}

// ============================================================================
// Gasless Payment (Meta-Transaction)
// ============================================================================

export interface ForwardRequest {
  from: string;
  to: string;
  value: string;
  gas: string;
  nonce: string;
  deadline: string;
  data: string;
  signature: string;
}

export interface GaslessPaymentResponse {
  status: string;
  message: string;
}

export interface RelayStatusResponse {
  status: 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  transactionHash?: string | null;
  errorMessage?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Submit a gasless payment via relay service (POST /payments/:id/relay).
 */
export async function submitGaslessPayment(
  paymentId: string,
  forwarderAddress: string,
  forwardRequest: ForwardRequest,
  publicKey: string
): Promise<GaslessPaymentResponse> {
  const apiBase = getGatewayApiBase();

  const response = await fetch(`${apiBase}/payments/${paymentId}/relay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-public-key': publicKey,
    },
    body: JSON.stringify({
      paymentId,
      forwarderAddress,
      forwardRequest,
    }),
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new PaymentApiError(
      error.code || 'GASLESS_ERROR',
      error.message || 'Failed to submit gasless payment',
      response.status,
      error.details
    );
  }

  if (data && typeof data === 'object' && 'success' in data) {
    const { success: _success, ...rest } = data as Record<string, unknown>;
    return rest as unknown as GaslessPaymentResponse;
  }

  return data as GaslessPaymentResponse;
}

/**
 * Get relay transaction status (GET /payments/:id/relay).
 */
export async function getRelayStatus(
  paymentId: string,
  options?: GetPaymentStatusOptions
): Promise<RelayStatusResponse> {
  const apiBase = getGatewayApiBase();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options?.publicKey) headers['x-public-key'] = options.publicKey;

  const response = await fetch(`${apiBase}/payments/${paymentId}/relay`, {
    method: 'GET',
    headers,
    cache: 'no-store',
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ErrorResponse;
    throw new PaymentApiError(
      error.code || 'RELAY_ERROR',
      error.message || 'Failed to get relay status',
      response.status,
      error.details
    );
  }

  if (data && data.success === true && data.data) {
    return data.data as RelayStatusResponse;
  }

  return data as RelayStatusResponse;
}

/**
 * Wait for relay transaction to complete.
 */
export async function waitForRelayTransaction(
  paymentId: string,
  options: {
    timeout?: number;
    interval?: number;
    publicKey?: string;
  } = {}
): Promise<RelayStatusResponse> {
  const { timeout = 120000, interval = 3000, publicKey } = options;
  const authOptions = publicKey !== undefined ? { publicKey } : undefined;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const status = await getRelayStatus(paymentId, authOptions);

    if (status.status === 'CONFIRMED') {
      return status;
    }

    if (status.status === 'FAILED') {
      throw new PaymentApiError(
        'RELAY_FAILED',
        status.errorMessage || 'Relay transaction failed',
        400
      );
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new PaymentApiError('RELAY_TIMEOUT', 'Relay transaction confirmation timeout', 408);
}
