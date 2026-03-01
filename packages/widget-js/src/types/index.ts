/** SDK Configuration options */
export interface SoloPayConfig {
  /** Public key for merchant authentication (pk_xxx) */
  publicKey: string;
  /** Widget base URL, no path (default: https://widget.solo-pay.com). SDK uses / on mobile, /pc on desktop. */
  widgetUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
}

/** Supported widget UI language (en | ko). Passed as URL param `lang`; when changed in widget UI, URL updates. */
export type WidgetLocale = 'en' | 'ko';

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
  /** Widget UI language: en (default) or ko. Sets URL param `lang` so widget opens in that language. */
  locale?: WidgetLocale;
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
