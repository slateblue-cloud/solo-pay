import Redis from 'ioredis';
import { getPrismaClient, disconnectPrisma } from '@solo-pay/database';
import { createWebhookWorker, createWebhookQueue } from './queue';
import { createBlockchainClients } from './blockchain';
import { startPaymentMonitor } from './monitor';

function getRedisConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (url) {
    return new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 100, 3000),
    });
  }
  const host = process.env.REDIS_HOST ?? 'localhost';
  const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);
  return new Redis({
    host,
    port,
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 100, 3000),
  });
}

async function main(): Promise<void> {
  const redis = getRedisConnection();

  // Webhook delivery worker (existing)
  const worker = createWebhookWorker({
    connection: redis,
    onSuccess: (job) => {
      console.log('[webhook] delivered %s job=%s', job.name, job.id);
    },
    onFailed: (job, err) => {
      console.error('[webhook] failed job=%s error=%s', job?.id, err.message);
    },
  });

  // Payment monitor: poll blockchain for CREATED/PENDING payments
  const prisma = getPrismaClient();

  const chains = await prisma.chain.findMany({
    where: {
      is_enabled: true,
      is_deleted: false,
      gateway_address: { not: null },
    },
  });

  const chainConfigs = chains
    .filter((c) => c.gateway_address)
    .map((c) => ({
      networkId: c.network_id,
      rpcUrl: c.rpc_url,
      gatewayAddress: c.gateway_address as string,
    }));

  const chainClients = createBlockchainClients(chainConfigs);
  console.log(
    '[webhook-manager] blockchain clients created for chains: %s',
    chainConfigs.map((c) => c.networkId).join(', ')
  );

  const webhookQueue = createWebhookQueue(redis);

  const pollingIntervalMs = parseInt(process.env.POLLING_INTERVAL_MS ?? '5000', 10);
  const blockchainCheckIntervalMs = parseInt(
    process.env.BLOCKCHAIN_CHECK_INTERVAL_MS ?? '1000',
    10
  );
  const timeoutMs = parseInt(process.env.PAYMENT_MONITOR_TIMEOUT_MS ?? '1800000', 10);

  const monitor = startPaymentMonitor({
    redis,
    prisma,
    chainClients,
    webhookQueue,
    pollingIntervalMs,
    blockchainCheckIntervalMs,
    timeoutMs,
  });

  console.log(
    '[webhook-manager] payment monitor started, dbPoll=%dms chainCheck=%dms timeout=%dms',
    pollingIntervalMs,
    blockchainCheckIntervalMs,
    timeoutMs
  );

  const shutdown = async (): Promise<void> => {
    console.log('[webhook-manager] shutting down...');
    await monitor.stop();
    await worker.close();
    await webhookQueue.close();
    await disconnectPrisma();
    await redis.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown());
  process.on('SIGINT', () => shutdown());

  console.log('[webhook-manager] worker started, queue=solo-pay-webhook');
}

main().catch((err) => {
  console.error('[webhook-manager] fatal error:', err);
  process.exit(1);
});
