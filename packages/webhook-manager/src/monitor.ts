import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@solo-pay/database';
import type { ChainClient } from './blockchain';
import { getOnChainStatus, OnChainPaymentStatus } from './blockchain';
import type { WebhookJobData, PaymentWebhookBody } from './types';
import {
  JOB_NAME_PAYMENT_ESCROWED,
  JOB_NAME_PAYMENT_FINALIZED,
  JOB_NAME_PAYMENT_CANCELLED,
} from './types';

const MONITOR_QUEUE_NAME = 'solo-pay-payment-monitor';

interface MonitorJobData {
  paymentHash: string;
  paymentId: number;
  merchantId: number;
  networkId: number;
  amount: string;
  tokenSymbol: string;
  orderId: string | null;
  webhookUrl: string | null;
  status: string;
}

export interface WebhookQueueForMonitor {
  addPaymentEvent(jobName: string, data: WebhookJobData): Promise<void>;
  /** @deprecated Use addPaymentEvent */
  addPaymentConfirmed(data: WebhookJobData): Promise<void>;
}

export interface MonitorOptions {
  redis: Redis;
  prisma: PrismaClient;
  chainClients: Map<number, ChainClient>;
  webhookQueue: WebhookQueueForMonitor;
  /** DB polling interval in ms (default 5000) */
  pollingIntervalMs: number;
  /** Blockchain check retry delay in ms (default 1000) */
  blockchainCheckIntervalMs: number;
  /** Only monitor payments created within this window (default 1800000 = 30min) */
  timeoutMs: number;
}

function buildWebhookBody(
  data: MonitorJobData,
  newStatus: string,
  txHash: string | null,
  releaseTxHash?: string | null
): PaymentWebhookBody {
  return {
    paymentId: data.paymentHash,
    orderId: data.orderId,
    status: newStatus,
    txHash,
    releaseTxHash: releaseTxHash ?? undefined,
    amount: data.amount,
    tokenSymbol: data.tokenSymbol,
    escrowedAt: newStatus === 'ESCROWED' ? new Date().toISOString() : undefined,
    finalizedAt: newStatus === 'FINALIZED' ? new Date().toISOString() : undefined,
    cancelledAt: newStatus === 'CANCELLED' ? new Date().toISOString() : undefined,
  };
}

/**
 * Multi-status payment monitor backed by BullMQ:
 *
 *   Stage 1 (DB poll, every pollingIntervalMs):
 *     query payments in monitored statuses → enqueue to monitor queue
 *
 *   Stage 2 (monitor worker, retry with blockchainCheckIntervalMs backoff):
 *     check on-chain status → update DB + enqueue webhook
 *
 *   Monitored transitions:
 *     CREATED/PENDING      → on-chain Escrowed  → DB ESCROWED   + webhook
 *     FINALIZE_SUBMITTED   → on-chain Finalized → DB FINALIZED  + webhook
 *     CANCEL_SUBMITTED     → on-chain Cancelled → DB CANCELLED  + webhook
 */
export function startPaymentMonitor(options: MonitorOptions): { stop: () => Promise<void> } {
  const {
    redis,
    prisma,
    chainClients,
    webhookQueue,
    pollingIntervalMs,
    blockchainCheckIntervalMs,
    timeoutMs,
  } = options;

  let running = true;
  let dbTimer: ReturnType<typeof setTimeout> | null = null;

  const maxAttempts = Math.max(Math.ceil(pollingIntervalMs / blockchainCheckIntervalMs), 3);

  // ── Monitor queue ────────────────────────────────────────────────────
  const monitorQueue = new Queue<MonitorJobData>(MONITOR_QUEUE_NAME, {
    connection: redis as import('bullmq').ConnectionOptions,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: true,
      attempts: maxAttempts,
      backoff: { type: 'fixed', delay: blockchainCheckIntervalMs },
    },
  });

  // ── Resolve webhook URL ────────────────────────────────────────────
  async function resolveWebhookUrl(data: MonitorJobData): Promise<string | null> {
    if (data.webhookUrl) return data.webhookUrl;
    const merchant = await prisma.merchant.findUnique({
      where: { id: data.merchantId },
    });
    return merchant?.webhook_url ?? null;
  }

  // ── Enqueue webhook ────────────────────────────────────────────────
  async function enqueueWebhook(
    data: MonitorJobData,
    jobName: string,
    newStatus: string,
    txHash: string | null,
    releaseTxHash?: string | null
  ): Promise<void> {
    const webhookUrl = await resolveWebhookUrl(data);
    if (!webhookUrl) return;
    const body = buildWebhookBody(data, newStatus, txHash, releaseTxHash);
    await webhookQueue.addPaymentEvent(jobName, { url: webhookUrl, body });
  }

  // ── Monitor worker ───────────────────────────────────────────────────
  const monitorWorker = new Worker<MonitorJobData>(
    MONITOR_QUEUE_NAME,
    async (job) => {
      const data = job.data;

      const chainClient = chainClients.get(data.networkId);
      if (!chainClient) return;

      const { status: onChainStatus, details } = await getOnChainStatus(
        chainClient.client,
        chainClient.gatewayAddress,
        data.paymentHash
      );

      switch (data.status) {
        case 'CREATED':
        case 'PENDING':
          await handleCreatedPending(data, onChainStatus, details);
          break;

        case 'FINALIZE_SUBMITTED':
          await handleFinalizeSubmitted(data, onChainStatus, details);
          break;

        case 'CANCEL_SUBMITTED':
          await handleCancelSubmitted(data, onChainStatus, details);
          break;

        default:
          break;
      }
    },
    {
      connection: redis as import('bullmq').ConnectionOptions,
      concurrency: 10,
    }
  );

  // ── CREATED/PENDING → ESCROWED ─────────────────────────────────────
  async function handleCreatedPending(
    data: MonitorJobData,
    onChainStatus: number,
    details: import('./blockchain').OnChainPaymentDetails | null
  ): Promise<void> {
    if (onChainStatus === OnChainPaymentStatus.None) {
      throw new Error('not_confirmed');
    }

    if (onChainStatus >= OnChainPaymentStatus.Escrowed && details) {
      // Amount verification
      const onChainAmount = BigInt(details.amount);
      const dbAmount = BigInt(data.amount);
      if (onChainAmount !== dbAmount) {
        console.error(
          '[monitor] amount mismatch payment=%s db=%s onchain=%s tx=%s',
          data.paymentHash,
          data.amount,
          onChainAmount.toString(),
          details.transactionHash
        );
        return;
      }

      const updated = await prisma.payment.updateMany({
        where: {
          payment_hash: data.paymentHash,
          status: { in: ['CREATED', 'PENDING'] },
        },
        data: {
          status: 'ESCROWED',
          tx_hash: details.transactionHash,
          confirmed_at: new Date(),
          ...(details.escrowDeadline && { escrow_deadline: new Date(details.escrowDeadline) }),
          ...(details.payerAddress && { payer_address: details.payerAddress }),
        },
      });

      if (updated.count === 0) return;

      await prisma.paymentEvent.create({
        data: {
          payment_id: data.paymentId,
          event_type: 'ESCROWED',
          old_status: data.status,
          new_status: 'ESCROWED',
        },
      });

      console.log('[monitor] escrowed payment=%s tx=%s', data.paymentHash, details.transactionHash);

      await enqueueWebhook(data, JOB_NAME_PAYMENT_ESCROWED, 'ESCROWED', details.transactionHash);
    }
  }

  // ── FINALIZE_SUBMITTED → FINALIZED ─────────────────────────────────
  async function handleFinalizeSubmitted(
    data: MonitorJobData,
    onChainStatus: number,
    details: import('./blockchain').OnChainPaymentDetails | null
  ): Promise<void> {
    if (onChainStatus === OnChainPaymentStatus.Finalized) {
      const txHash = details?.transactionHash ?? null;

      const updated = await prisma.payment.updateMany({
        where: {
          payment_hash: data.paymentHash,
          status: 'FINALIZE_SUBMITTED',
        },
        data: {
          status: 'FINALIZED',
          finalized_at: new Date(),
          ...(txHash && { release_tx_hash: txHash }),
        },
      });

      if (updated.count === 0) return;

      await prisma.paymentEvent.create({
        data: {
          payment_id: data.paymentId,
          event_type: 'FINALIZE_CONFIRMED',
          old_status: 'FINALIZE_SUBMITTED',
          new_status: 'FINALIZED',
        },
      });

      console.log('[monitor] finalized payment=%s release_tx=%s', data.paymentHash, txHash);
      await enqueueWebhook(data, JOB_NAME_PAYMENT_FINALIZED, 'FINALIZED', null, txHash);
      return;
    }

    // Still escrowed — retry
    if (onChainStatus === OnChainPaymentStatus.Escrowed) {
      throw new Error('not_finalized');
    }
  }

  // ── CANCEL_SUBMITTED → CANCELLED ───────────────────────────────────
  async function handleCancelSubmitted(
    data: MonitorJobData,
    onChainStatus: number,
    details: import('./blockchain').OnChainPaymentDetails | null
  ): Promise<void> {
    if (onChainStatus === OnChainPaymentStatus.Cancelled) {
      const txHash = details?.transactionHash ?? null;

      const updated = await prisma.payment.updateMany({
        where: {
          payment_hash: data.paymentHash,
          status: 'CANCEL_SUBMITTED',
        },
        data: {
          status: 'CANCELLED',
          cancelled_at: new Date(),
          ...(txHash && { release_tx_hash: txHash }),
        },
      });

      if (updated.count === 0) return;

      await prisma.paymentEvent.create({
        data: {
          payment_id: data.paymentId,
          event_type: 'CANCEL_CONFIRMED',
          old_status: 'CANCEL_SUBMITTED',
          new_status: 'CANCELLED',
        },
      });

      console.log('[monitor] cancelled payment=%s release_tx=%s', data.paymentHash, txHash);
      await enqueueWebhook(data, JOB_NAME_PAYMENT_CANCELLED, 'CANCELLED', null, txHash);
      return;
    }

    // Still escrowed — retry
    if (onChainStatus === OnChainPaymentStatus.Escrowed) {
      throw new Error('not_cancelled');
    }
  }

  // ── DB poller ────────────────────────────────────────────────────────
  async function pollDb(): Promise<void> {
    if (!running) return;

    try {
      const cutoff = new Date(Date.now() - timeoutMs);
      const payments = await prisma.payment.findMany({
        where: {
          status: { in: ['CREATED', 'PENDING', 'FINALIZE_SUBMITTED', 'CANCEL_SUBMITTED'] },
          created_at: { gt: cutoff },
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      for (const payment of payments) {
        // jobId includes status to avoid dedup conflicts across different status monitors
        await monitorQueue.add(
          'check-payment',
          {
            paymentHash: payment.payment_hash,
            paymentId: payment.id,
            merchantId: payment.merchant_id,
            networkId: payment.network_id,
            amount: payment.amount.toString(),
            tokenSymbol: payment.token_symbol,
            orderId: payment.order_id ?? null,
            webhookUrl: payment.webhook_url ?? null,
            status: payment.status,
          },
          { jobId: `${payment.payment_hash}-${payment.status}` }
        );
      }
    } catch (err) {
      console.error(
        '[monitor] db poll error: %s',
        err instanceof Error ? err.message : String(err)
      );
    }

    if (running) {
      dbTimer = setTimeout(pollDb, pollingIntervalMs);
    }
  }

  // Start DB poller immediately
  dbTimer = setTimeout(pollDb, 0);

  return {
    stop: async () => {
      running = false;
      if (dbTimer) {
        clearTimeout(dbTimer);
        dbTimer = null;
      }
      await monitorWorker.close();
      await monitorQueue.close();
    },
  };
}
