import { Queue, Worker } from 'bullmq';
import type { Redis } from 'ioredis';
import type { PrismaClient } from '@solo-pay/database';
import type { ChainClient } from './blockchain';
import { checkPaymentOnChain } from './blockchain';
import type { WebhookJobData, PaymentConfirmedBody } from './types';

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

/**
 * Two-stage payment monitor backed by BullMQ:
 *   Stage 1 (DB poll, every pollingIntervalMs):
 *     query CREATED/PENDING payments → enqueue to monitor queue (jobId = paymentHash for dedup)
 *   Stage 2 (monitor worker, retry with blockchainCheckIntervalMs backoff):
 *     check blockchain → not confirmed = throw (retry) → confirmed = DB update + webhook
 *
 * Between DB polls, the worker retries each job up to (pollingInterval / checkInterval) times.
 * After exhausting retries the job is removed (removeOnFail), and the next DB poll re-enqueues
 * payments that are still CREATED/PENDING.
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

  // ── Monitor worker ───────────────────────────────────────────────────
  const monitorWorker = new Worker<MonitorJobData>(
    MONITOR_QUEUE_NAME,
    async (job) => {
      const data = job.data;

      const chainClient = chainClients.get(data.networkId);
      if (!chainClient) return;

      const onChain = await checkPaymentOnChain(
        chainClient.client,
        chainClient.gatewayAddress,
        data.paymentHash
      );

      if (!onChain) {
        throw new Error('not_confirmed');
      }

      // Amount verification
      const onChainAmount = BigInt(onChain.amount);
      const dbAmount = BigInt(data.amount);
      if (onChainAmount !== dbAmount) {
        console.error(
          '[monitor] amount mismatch payment=%s db=%s onchain=%s tx=%s',
          data.paymentHash,
          data.amount,
          onChainAmount.toString(),
          onChain.transactionHash
        );
        return;
      }

      // Conditional update: only if still CREATED/PENDING (prevents duplicate webhooks)
      const updated = await prisma.payment.updateMany({
        where: {
          payment_hash: data.paymentHash,
          status: { in: ['CREATED', 'PENDING'] },
        },
        data: {
          status: 'CONFIRMED',
          tx_hash: onChain.transactionHash,
          confirmed_at: new Date(),
          ...(onChain.payerAddress && { payer_address: onChain.payerAddress }),
        },
      });

      if (updated.count === 0) return; // already confirmed elsewhere

      // Create payment event
      await prisma.paymentEvent.create({
        data: {
          payment_id: data.paymentId,
          event_type: 'STATUS_CHANGED',
          old_status: data.status,
          new_status: 'CONFIRMED',
        },
      });

      console.log(
        '[monitor] confirmed payment=%s tx=%s',
        data.paymentHash,
        onChain.transactionHash
      );

      // Resolve webhook URL
      let webhookUrl = data.webhookUrl;
      if (!webhookUrl) {
        const merchant = await prisma.merchant.findUnique({
          where: { id: data.merchantId },
        });
        webhookUrl = merchant?.webhook_url ?? null;
      }

      if (webhookUrl) {
        const body: PaymentConfirmedBody = {
          paymentId: data.paymentHash,
          orderId: data.orderId,
          status: 'CONFIRMED',
          txHash: onChain.transactionHash,
          amount: data.amount,
          tokenSymbol: data.tokenSymbol,
          confirmedAt: new Date().toISOString(),
        };
        await webhookQueue.addPaymentConfirmed({ url: webhookUrl, body });
      }
    },
    {
      connection: redis as import('bullmq').ConnectionOptions,
      concurrency: 10,
    }
  );

  // ── DB poller ────────────────────────────────────────────────────────
  async function pollDb(): Promise<void> {
    if (!running) return;

    try {
      const cutoff = new Date(Date.now() - timeoutMs);
      const payments = await prisma.payment.findMany({
        where: {
          status: { in: ['CREATED', 'PENDING'] },
          created_at: { gt: cutoff },
        },
        orderBy: { created_at: 'asc' },
        take: 100,
      });

      for (const payment of payments) {
        // jobId = paymentHash → BullMQ auto-deduplicates while job is active/delayed
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
          { jobId: payment.payment_hash }
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
