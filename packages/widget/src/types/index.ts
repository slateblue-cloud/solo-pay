export type PaymentStepType =
  | 'wallet-connect'
  | 'token-approval'
  | 'payment-confirm'
  | 'payment-processing'
  | 'payment-complete';

/** Supported UI locale (URL param lang). */
export type WidgetLocale = 'en' | 'ko';

/**
 * URL parameters for widget initialization
 * Matches: /?pk=xxx&orderId=xxx&amount=xxx&tokenAddress=xxx&successUrl=xxx&failUrl=xxx&lang=en|ko
 */
export interface WidgetUrlParams {
  /** Public key for merchant authentication (required) */
  pk: string;
  /** Merchant order ID (required in creation mode) */
  orderId: string;
  /** Payment amount in human readable format (required in creation mode) */
  amount: string;
  /** ERC-20 token contract address (required in creation mode) */
  tokenAddress: string;
  /** Redirect URL on success (required in creation mode) */
  successUrl: string;
  /** Redirect URL on failure (required in creation mode) */
  failUrl: string;
  /** Fiat currency code (optional, e.g., USD, KRW) */
  currency?: string;
  /** If true, only connect wallet — no gateway API or payment flow */
  walletOnly?: boolean;
  /** UI language: en (default) or ko. When changed in UI, URL is updated. */
  lang?: WidgetLocale;
  /** Payment ID for resume mode (skips creation and fetches existing payment) */
  paymentId?: string;
}

/**
 * Validation result for URL parameters
 */
export interface UrlParamsValidationResult {
  /** Whether validation passed */
  isValid: boolean;
  /** Validated parameters (only if isValid is true) */
  params?: WidgetUrlParams;
  /** Validation errors (only if isValid is false) */
  errors?: string[];
}

/**
 * API response from POST /payments
 */
export interface PaymentDetails {
  /** Payment hash for smart contract */
  paymentId: string;
  /** Merchant order ID */
  orderId: string;
  /** Server EIP-712 signature for contract verification */
  serverSignature: string;
  /** Blockchain network ID */
  chainId: number;
  /** ERC20 token contract address */
  tokenAddress: string;
  /** PaymentGateway contract address */
  gatewayAddress: string;
  /** Amount in wei (string) */
  amount: string;
  /** Token decimals */
  tokenDecimals: number;
  /** Token symbol (e.g., USDT) */
  tokenSymbol: string;
  /** Redirect URL on success */
  successUrl: string;
  /** Redirect URL on failure */
  failUrl: string;
  /** Payment expiration time (ISO string) */
  expiresAt: string;
  /** Recipient/treasury address */
  recipientAddress: string;
  /** Merchant ID (bytes32) */
  merchantId: string;
  /** Fee in basis points (e.g., 100 = 1%) */
  feeBps: number;
  /** Deadline timestamp for server signature expiration */
  deadline: string;
  /** Escrow duration in seconds (bigint as string from API) */
  escrowDuration: string;
  /** ERC2771Forwarder contract address (for gasless payments) */
  forwarderAddress?: string;
  /** Whether the token supports EIP-2612 permit (from server, skips on-chain probing) */
  tokenPermitSupported?: boolean;
  /** Fiat currency code used for conversion */
  currency?: string;
  /** Original fiat amount before conversion */
  fiatAmount?: number;
  /** Token price at creation time */
  tokenPrice?: number;
  /** Payment status (returned by GET /payments/:id/details for resume mode) */
  status?:
    | 'CREATED'
    | 'PENDING'
    | 'PROCESSING'
    | 'CONFIRMED'
    | 'FAILED'
    | 'EXPIRED'
    | 'FINALIZED'
    | 'CANCELLED';
}

/** Gas payment mode */
export type GasMode = 'direct' | 'gasless';

/**
 * @deprecated Use WidgetUrlParams and PaymentDetails instead
 */
export interface PaymentInfo {
  product: string;
  amount: string;
  token: string;
  network: string;
  merchantId?: string;
}

export interface WalletInfo {
  address: string;
  balance: string;
}

export interface TransactionResult {
  txHash: string;
  date: string;
}
