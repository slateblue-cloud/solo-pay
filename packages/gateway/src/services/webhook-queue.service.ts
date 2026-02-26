import type { Payment } from '@solo-pay/database';
import type { Merchant } from '@solo-pay/database';
import type { PaymentWebhookBody, WebhookJobData } from '@solo-pay/webhook-manager';
import {
  JOB_NAME_PAYMENT_CONFIRMED,
  JOB_NAME_PAYMENT_ESCROWED,
  JOB_NAME_PAYMENT_FINALIZED,
  JOB_NAME_PAYMENT_CANCELLED,
} from '@solo-pay/webhook-manager';

export interface WebhookQueueAdapter {
  addPaymentEvent(jobName: string, data: WebhookJobData): Promise<void>;
  /** @deprecated Use addPaymentEvent */
  addPaymentConfirmed(data: WebhookJobData): Promise<void>;
}

/**
 * Callback when webhook enqueue fails (for logging). Receives error and payment hash.
 */
export type WebhookEnqueueErrorLogger = (err: unknown, paymentId: string) => void;

/** Map payment status to BullMQ job name */
const STATUS_JOB_MAP: Record<string, string | undefined> = {
  CONFIRMED: JOB_NAME_PAYMENT_CONFIRMED,
  ESCROWED: JOB_NAME_PAYMENT_ESCROWED,
  FINALIZED: JOB_NAME_PAYMENT_FINALIZED,
  CANCELLED: JOB_NAME_PAYMENT_CANCELLED,
};

/**
 * Generic webhook enqueue: resolves URL, builds body, and enqueues (fire-and-forget).
 * Automatically selects the correct job name based on payment.status.
 */
export function enqueuePaymentWebhook(
  webhookQueue: WebhookQueueAdapter,
  payment: Payment,
  merchant: Merchant | null,
  onError: WebhookEnqueueErrorLogger
): void {
  const webhookUrl = resolveWebhookUrl(payment, merchant);
  if (!webhookUrl) return;

  const jobName = STATUS_JOB_MAP[payment.status];
  if (!jobName) return;

  webhookQueue
    .addPaymentEvent(jobName, {
      url: webhookUrl,
      body: buildPaymentWebhookBody(payment),
    })
    .catch((err) => onError(err, payment.payment_hash));
}

/**
 * @deprecated Use enqueuePaymentWebhook instead.
 */
export function enqueuePaymentConfirmedWebhook(
  webhookQueue: WebhookQueueAdapter,
  payment: Payment,
  merchant: Merchant | null,
  onError: WebhookEnqueueErrorLogger
): void {
  const webhookUrl = resolveWebhookUrl(payment, merchant);
  if (!webhookUrl) return;
  webhookQueue
    .addPaymentConfirmed({
      url: webhookUrl,
      body: buildPaymentWebhookBody(payment),
    })
    .catch((err) => onError(err, payment.payment_hash));
}

/**
 * Resolve webhook URL: payment.webhook_url ?? merchant.webhook_url.
 * Returns null if neither is set.
 */
export function resolveWebhookUrl(payment: Payment, merchant: Merchant | null): string | null {
  if (payment.webhook_url) return payment.webhook_url;
  if (merchant?.webhook_url) return merchant.webhook_url;
  return null;
}

/**
 * Build generic webhook body from a Payment record.
 */
export function buildPaymentWebhookBody(payment: Payment): PaymentWebhookBody {
  return {
    paymentId: payment.payment_hash,
    orderId: payment.order_id ?? null,
    status: payment.status,
    txHash: payment.tx_hash ?? null,
    amount: payment.amount.toString(),
    tokenSymbol: payment.token_symbol,
    confirmedAt: payment.confirmed_at?.toISOString(),
    escrowedAt: payment.escrow_deadline?.toISOString(),
    finalizedAt: payment.finalized_at?.toISOString(),
    cancelledAt: payment.cancelled_at?.toISOString(),
  };
}

/**
 * @deprecated Use buildPaymentWebhookBody instead.
 */
export const buildPaymentConfirmedBody = buildPaymentWebhookBody;
