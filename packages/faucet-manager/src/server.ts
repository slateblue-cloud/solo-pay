import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { getPrismaClient, disconnectPrisma } from './db/client';
import { createPublicAuthMiddleware } from './server/auth';
import { createBlockchainService } from './server/blockchain';
import {
  createSendNativeViaRelayer,
  type RelayerConfigForChain,
} from './server/relayer-client';
import { registerRequestGasRoute } from './server/request-gas-route';
import { swaggerConfig, swaggerUiConfig } from './server/swagger.config';

async function start(): Promise<void> {
  const prisma = getPrismaClient();

  const blockchainService = createBlockchainService(prisma);
  await blockchainService.loadChains();

  // Relayer URL per chain from DB (chains.relayer_url), same as gateway; API key from env per chain
  const getConfigForChain = async (chainId: number): Promise<RelayerConfigForChain> => {
    const chain = await prisma.chain.findFirst({
      where: {
        network_id: chainId,
        is_deleted: false,
        gateway_address: { not: null },
      },
      select: { relayer_url: true },
    });
    const baseUrl = chain?.relayer_url?.trim();
    if (!baseUrl) {
      throw new Error(`No relayer URL configured for chain ${chainId}`);
    }
    const apiKey = process.env[`RELAY_API_KEY_${chainId}`]?.trim() || undefined;
    return { baseUrl, apiKey };
  };

  const sendNative = createSendNativeViaRelayer(getConfigForChain);

  const app = Fastify({ logger: true });
  await app.register(cors, { origin: true });
  await app.register(swagger, swaggerConfig);
  await app.register(swaggerUi, swaggerUiConfig);

  const publicAuth = createPublicAuthMiddleware(prisma);

  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/payments/request-gas' && request.method === 'POST') {
      return publicAuth(request, reply);
    }
  });

  await registerRequestGasRoute(app, prisma, blockchainService, sendNative);

  app.get('/payments/request-gas', async (_request, reply) => {
    return reply.code(405).send({
      code: 'METHOD_NOT_ALLOWED',
      message: 'Use POST with body: { paymentId, walletAddress } and headers: x-public-key, origin',
    });
  });

  app.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => ({ status: 'ok', timestamp: new Date().toISOString() })
  );

  const port = Number(process.env.PORT) || 3002;
  const host = process.env.HOST ?? '0.0.0.0';

  await app.listen({ port, host });
  console.log(`Faucet-manager listening on http://${host}:${port}`);

  const shutdown = async (): Promise<void> => {
    await app.close();
    await disconnectPrisma();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
