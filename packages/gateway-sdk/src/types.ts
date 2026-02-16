export type Environment = 'development' | 'staging' | 'production' | 'custom';

export interface SoloPayConfig {
  environment: Environment;
  /** API key for admin routes (merchant, payment methods, refunds, payment detail, history, info) */
  apiKey: string;
  apiUrl?: string;
  /** Public key (pk_live_xxx or pk_test_xxx) for POST /payments. Required when using createPayment(). */
  publicKey?: string;
  /** Origin header value; must match one of merchant allowed_domains. Required when using createPayment(). */
  origin?: string;
}

/** Params for POST /payments (public key + Origin auth). tokenAddress must be whitelisted and enabled for merchant. */
export interface CreatePaymentParams {
  /** Merchant order ID */
  orderId: string;
  /** Payment amount (token units) */
  amount: number;
  /** ERC-20 token contract address (must be whitelisted and enabled for merchant) */
  tokenAddress: string;
  /** Redirect URL on success */
  successUrl: string;
  /** Redirect URL on failure */
  failUrl: string;
  /** Fiat currency code (e.g., USD, KRW). When provided, amount is treated as fiat amount. */
  currency?: string;
}

/**
 * ERC2771 ForwardRequest for gasless meta-transactions
 * Matches OZ ERC2771Forwarder.execute() parameters
 */
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

export interface GaslessParams {
  paymentId: string;
  forwarderAddress: string;
  forwardRequest: ForwardRequest;
}

// Response types (matches gateway POST /payments 201 response)
export interface CreatePaymentResponse {
  /** Present when gateway returns 201; omitted in error paths */
  success?: true;
  paymentId: string;
  orderId: string;
  /** Server EIP-712 signature for payment authorization */
  serverSignature: string;
  chainId: number;
  tokenAddress: string;
  gatewayAddress: string;
  amount: string; // wei
  tokenDecimals: number;
  tokenSymbol: string;
  successUrl: string;
  failUrl: string;
  expiresAt: string;
  recipientAddress: string;
  merchantId: string;
  feeBps: number;
  /** ERC2771Forwarder address for gasless payments */
  forwarderAddress?: string;
  /** Fiat currency code used for conversion */
  currency?: string;
  /** Original fiat amount before conversion */
  fiatAmount?: number;
  /** Token price at creation time */
  tokenPrice?: number;
}

/** Response from GET /payments/:id */
export interface PaymentStatusResponse {
  success: true;
  data: {
    paymentId: string;
    /** Payer wallet address (from chain) */
    payerAddress: string;
    amount: number;
    tokenAddress: string;
    tokenSymbol: string;
    /** 결제를 받는 treasury 주소 (컨트랙트 배포 시 설정) */
    treasuryAddress: string;
    status: string;
    transactionHash?: string;
    blockNumber?: number;
    createdAt: string;
    updatedAt: string;
    payment_hash: string;
    network_id: number;
    token_symbol: string;
  };
}

/** Response from POST /payments/:id/relay (202) */
export interface GaslessResponse {
  success: true;
  status: 'submitted' | 'mined' | 'failed';
  message: string;
}

/** Response from GET /payments/:id/relay */
export interface RelayStatusResponse {
  success: true;
  data: {
    status: 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
    transactionHash: string | null;
    errorMessage: string | null;
    createdAt: string;
    updatedAt: string;
  };
}

// ============================================================================
// Merchant types (x-api-key auth)
// ============================================================================

/** Chain info returned from merchant/chains endpoints */
export interface ChainInfo {
  id: number;
  network_id: number;
  name: string;
  is_testnet: boolean;
}

/** Token info */
export interface TokenInfo {
  id: number;
  address: string;
  symbol: string;
  decimals: number;
  chain_id?: number;
}

/** Payment method with token and chain info */
export interface PaymentMethod {
  id: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
  token: TokenInfo;
  chain: ChainInfo;
}

/** Response from GET /merchant */
export interface MerchantInfoResponse {
  success: true;
  merchant: {
    id: number;
    merchant_key: string;
    name: string;
    chain_id: number | null;
    chain: ChainInfo | null;
    webhook_url: string | null;
    public_key: string | null;
    allowed_domains: string[] | null;
    is_enabled: boolean;
    created_at: string;
    updated_at: string;
    payment_methods: PaymentMethod[];
  };
  chainTokens: Array<ChainInfo & { tokens: TokenInfo[] }>;
}

/** Response from GET /merchant/payment-methods */
export interface PaymentMethodListResponse {
  success: true;
  payment_methods: PaymentMethod[];
}

/** Response from POST /merchant/payment-methods */
export interface CreatePaymentMethodResponse {
  success: true;
  payment_method: PaymentMethod;
}

/** Params for POST /merchant/payment-methods */
export interface CreatePaymentMethodParams {
  tokenAddress: string;
  is_enabled?: boolean;
}

/** Params for PATCH /merchant/payment-methods/:id */
export interface UpdatePaymentMethodParams {
  is_enabled?: boolean;
}

/** Response from PATCH /merchant/payment-methods/:id */
export interface UpdatePaymentMethodResponse {
  success: true;
  payment_method: PaymentMethod;
}

/** Response from DELETE /merchant/payment-methods/:id */
export interface DeletePaymentMethodResponse {
  success: true;
  message: string;
}

/** Response from GET /merchant/payments (by orderId) and GET /merchant/payments/:id */
export interface MerchantPaymentDetailResponse {
  paymentId: string;
  orderId?: string;
  status: 'CREATED' | 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED';
  amount: string;
  tokenSymbol: string;
  tokenDecimals: number;
  txHash?: string;
  payerAddress?: string;
  createdAt: string;
  confirmedAt?: string;
  expiresAt: string;
}

// ============================================================================
// Refund types (x-api-key auth)
// ============================================================================

/** Params for POST /refunds */
export interface CreateRefundParams {
  paymentId: string;
  reason?: string;
}

/** Response from POST /refunds */
export interface CreateRefundResponse {
  success: true;
  data: {
    refundId: string;
    paymentId: string;
    amount: string;
    tokenAddress: string;
    payerAddress: string;
    status: string;
    serverSignature: string;
    merchantId: string;
    createdAt: string;
  };
}

/** Response from GET /refunds/:refundId */
export interface RefundStatusResponse {
  success: true;
  data: {
    refundId: string;
    paymentId: string;
    amount: string;
    tokenAddress: string;
    tokenSymbol: string;
    tokenDecimals: number;
    payerAddress: string;
    status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
    reason: string | null;
    txHash: string | null;
    errorMessage: string | null;
    createdAt: string;
    submittedAt: string | null;
    confirmedAt: string | null;
  };
}

/** Refund list item */
export interface RefundListItem {
  refundId: string;
  paymentId: string;
  amount: string;
  tokenAddress: string;
  payerAddress: string;
  status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  reason: string | null;
  txHash: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

/** Params for GET /refunds */
export interface GetRefundListParams {
  page?: number;
  limit?: number;
  status?: 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  paymentId?: string;
}

/** Response from GET /refunds */
export interface RefundListResponse {
  success: true;
  data: {
    items: RefundListItem[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  };
}

// ============================================================================
// Chains types (public, no auth)
// ============================================================================

/** Response from GET /chains */
export interface ChainsResponse {
  success: true;
  chains: ChainInfo[];
}

/** Response from GET /chains/tokens */
export interface ChainsWithTokensResponse {
  success: true;
  chains: Array<ChainInfo & { tokens: TokenInfo[] }>;
}

// ============================================================================
// Error types
// ============================================================================

export interface ErrorDetails {
  message?: string;
  path?: (string | number)[];
  [key: string]: string | number | boolean | (string | number)[] | undefined;
}

export interface ErrorResponse {
  success: false;
  code: string;
  message: string;
  details?: ErrorDetails[];
}
