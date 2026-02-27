/**
 * Generic webhook body for any payment status change.
 * Fields are a superset – only relevant fields will be populated per event.
 */
export interface PaymentWebhookBody {
  paymentId: string;
  orderId: string | null;
  status: string;
  txHash: string | null;
  amount: string;
  tokenSymbol: string;
  /** ISO-8601 timestamp (present on CONFIRMED / FINALIZED) */
  confirmedAt?: string;
  /** ISO-8601 timestamp (present on ESCROWED) */
  escrowedAt?: string;
  /** ISO-8601 timestamp (present on FINALIZED) */
  finalizedAt?: string;
  /** ISO-8601 timestamp (present on CANCELLED) */
  cancelledAt?: string;
}

/** @deprecated Use PaymentWebhookBody instead */
export type PaymentConfirmedBody = PaymentWebhookBody;

/**
 * Job data for webhook queue: URL and body to POST.
 */
export interface WebhookJobData {
  url: string;
  body: PaymentWebhookBody;
}

export const WEBHOOK_QUEUE_NAME = 'solo-pay-webhook';

// Job name constants
export const JOB_NAME_PAYMENT_CONFIRMED = 'payment.confirmed';
export const JOB_NAME_PAYMENT_ESCROWED = 'payment.escrowed';
export const JOB_NAME_PAYMENT_FINALIZED = 'payment.finalized';
export const JOB_NAME_PAYMENT_CANCELLED = 'payment.cancelled';
