/** SDK Configuration options */
export interface SoloPayConfig {
  /** Public key for merchant authentication (pk_xxx) */
  publicKey: string;
  /** Widget base URL, no path (default: https://widget.solo-pay.com). SDK uses / on mobile, /pc on desktop. */
  widgetUrl?: string;
  /** WalletConnect Cloud project ID. When set, widget uses AppKit (WalletConnect) for connect. */
  wcProjectId?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Default redirect mode */
  redirectMode?: RedirectMode;
}

/** How to open the payment widget (mobile only; PC always uses popup)
 * - 'auto': redirect on mobile, popup on PC (default)
 * - 'redirect': Always redirect to widget page
 * - 'iframe': Deprecated; treated as redirect on mobile
 */
export type RedirectMode = 'auto' | 'redirect' | 'iframe';

/** Payment request options - matches widget URL parameters */
export interface PaymentRequest {
  /** Merchant order ID (required) */
  orderId: string;
  /** Payment amount in human readable format, e.g., "10", "10.50", or 10 (required) */
  amount: string | number;
  /** ERC-20 token contract address (required) */
  tokenAddress: string;
  /** Redirect URL on success (required) */
  successUrl: string;
  /** Redirect URL on failure (required) */
  failUrl: string;
  /** Fiat currency code (e.g., USD, KRW). When provided, amount is treated as fiat amount. */
  currency?: string;
}

/** Payment result from callback */
export interface PaymentResult {
  /** Whether payment was successful */
  success: boolean;
  /** Payment ID from contract */
  paymentId?: string;
  /** Transaction hash */
  txHash?: string;
  /** Order ID */
  orderId: string;
  /** Error message (if failed) */
  error?: string;
}

/** Token information for display */
export interface TokenInfo {
  /** Token contract address */
  address: string;
  /** Token symbol (e.g., USDT) */
  symbol: string;
  /** Token decimals */
  decimals: number;
  /** Token name */
  name?: string;
  /** Token icon URL */
  iconUrl?: string;
}
