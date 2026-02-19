import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

import { createLogger } from './lib/logger';
import { API_V1_BASE_PATH } from './constants';
import { swaggerConfig, swaggerUiConfig } from './docs/swagger.config';
import { BlockchainService } from './services/blockchain.service';
import { RelayerService } from './services/relayer.service';
import { PaymentService } from './services/payment.service';
import { MerchantService } from './services/merchant.service';
import { ChainService } from './services/chain.service';
import { TokenService } from './services/token.service';
import { PaymentMethodService } from './services/payment-method.service';
import { RelayService } from './services/relay.service';
import { ServerSigningService } from './services/signature-server.service';
import { getPrismaClient, disconnectPrisma } from './db/client';
import { getRedisClient, disconnectRedis } from './db/redis';
import { createPaymentRoute } from './routes/payments/create';
import { getPaymentStatusRoute } from './routes/payments/get-status';
import { submitGaslessRoute } from './routes/payments/gasless';
import { getRelayStatusRoute as getPaymentRelayStatusRoute } from './routes/payments/relay-status';
import { getMerchantRoute } from './routes/merchants/get';
import { paymentMethodsRoute } from './routes/merchants/payment-methods';
import { merchantPaymentRoute } from './routes/merchants/payments';
import { getChainsRoute } from './routes/chains/get';
import { CurrencyService } from './services/currency.service';
import { PriceClient } from './services/price-client.service';
import { RefundService } from './services/refund.service';
import { createRefundRoute } from './routes/refunds/create';
import { getRefundStatusRoute } from './routes/refunds/status';
import { getRefundListRoute } from './routes/refunds/list';

const server = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      // Allow OpenAPI keywords like 'example' in JSON Schema
      keywords: ['example'],
    },
  },
});

const logger = createLogger('Server');

// Initialize database clients
const prisma = getPrismaClient();
getRedisClient();

// Initialize database services (ChainService needed for BlockchainService initialization)
const chainService = new ChainService(prisma);

// BlockchainService will be initialized after loading chains from DB
let blockchainService: BlockchainService;

// Server signing services (one per chain)
let signingServices: Map<number, ServerSigningService>;

// Relayer services (one per chain, initialized from DB)
let relayerServices: Map<number, RelayerService>;

// Initialize other database services
const paymentService = new PaymentService(prisma);
const merchantService = new MerchantService(prisma);
const tokenService = new TokenService(prisma);
const paymentMethodService = new PaymentMethodService(prisma);
const relayService = new RelayService(prisma);
const refundService = new RefundService(prisma);
const currencyService = new CurrencyService(prisma);

// Initialize Price Client for currency conversion
const priceServiceUrl = process.env.PRICE_SERVICE_URL || 'http://localhost:3006';
const priceClient = new PriceClient(priceServiceUrl);

// Route auth: Public key + Origin for payment endpoints; x-api-key for merchant endpoints; no auth for chains/health
const registerRoutes = async () => {
  // Health and root: no version prefix
  server.get(
    '/health',
    {
      schema: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Returns server health status',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'ok' },
              timestamp: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    }
  );

  server.get(
    '/',
    {
      schema: {
        tags: ['Health'],
        summary: 'Server info',
        description: 'Returns server information and supported chains',
        response: {
          200: {
            type: 'object',
            properties: {
              service: { type: 'string', example: 'Solo Pay Gateway' },
              version: { type: 'string', example: '0.1.0' },
              status: { type: 'string', example: 'running' },
              supportedChains: {
                type: 'array',
                items: { type: 'number' },
                example: [80002, 137],
              },
            },
          },
        },
      },
    },
    async () => {
      return {
        service: 'Solo Pay Gateway',
        version: '0.1.0',
        status: 'running',
        supportedChains: blockchainService.getSupportedChainIds(),
      };
    }
  );

  // All business routes under API_V1_BASE_PATH
  await server.register(
    async (scope) => {
      // Public (x-public-key + Origin)
      await createPaymentRoute(
        scope,
        blockchainService,
        merchantService,
        chainService,
        tokenService,
        paymentMethodService,
        paymentService,
        signingServices,
        currencyService,
        priceClient
      );
      await getPaymentStatusRoute(scope, blockchainService, paymentService, merchantService);
      await submitGaslessRoute(
        scope,
        relayerServices,
        relayService,
        paymentService,
        merchantService
      );
      await getPaymentRelayStatusRoute(
        scope,
        relayService,
        relayerServices,
        paymentService,
        merchantService
      );

      // Private (x-api-key)
      await getMerchantRoute(
        scope,
        merchantService,
        paymentMethodService,
        tokenService,
        chainService
      );
      await merchantPaymentRoute(scope, blockchainService, merchantService, paymentService);
      await paymentMethodsRoute(
        scope,
        merchantService,
        paymentMethodService,
        tokenService,
        chainService
      );
      await createRefundRoute(
        scope,
        merchantService,
        paymentService,
        refundService,
        blockchainService,
        signingServices
      );
      await getRefundStatusRoute(scope, merchantService, paymentService, refundService);
      await getRefundListRoute(scope, merchantService, paymentService, refundService);

      // No Auth
      await getChainsRoute(scope, chainService, tokenService);
    },
    { prefix: API_V1_BASE_PATH }
  );
};

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`\n📢 Received ${signal}, shutting down gracefully...`);
  try {
    await server.close();
    await disconnectPrisma();
    await disconnectRedis();
    logger.info('✅ Server closed successfully');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, '❌ Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const start = async () => {
  try {
    // Register CORS
    await server.register(cors, {
      origin: true, // Allow all origins in development
    });

    // Register Swagger documentation (must be before routes)
    await server.register(swagger, swaggerConfig);
    await server.register(swaggerUi, swaggerUiConfig);

    // Load chain configuration from database
    logger.info('📋 Loading chain configuration from database...');
    const chainsWithTokens = await chainService.findAllWithTokens();

    if (chainsWithTokens.length === 0) {
      logger.error('❌ No chains with contract addresses found in database');
      logger.error('💡 Make sure chains table has gateway_address and forwarder_address set');
      process.exit(1);
    }

    // Initialize BlockchainService with DB data
    blockchainService = new BlockchainService(chainsWithTokens);
    logger.info(`🔗 Supported chains: ${blockchainService.getSupportedChainIds().join(', ')}`);

    // Initialize server signing services for each chain
    const signerPrivateKey = process.env.SIGNER_PRIVATE_KEY;
    signingServices = new Map();

    if (signerPrivateKey) {
      for (const chain of chainsWithTokens) {
        if (chain.gateway_address) {
          try {
            const service = new ServerSigningService(
              signerPrivateKey as `0x${string}`,
              chain.network_id,
              chain.gateway_address as `0x${string}`
            );
            signingServices.set(chain.network_id, service);
            logger.info(
              `🔐 Signing service initialized for chain ${chain.network_id} (${chain.name})`
            );
          } catch (error) {
            logger.warn(
              { err: error },
              `Failed to initialize signing service for chain ${chain.network_id}`
            );
          }
        }
      }
    } else {
      logger.warn('⚠️  SIGNER_PRIVATE_KEY not set - server signatures will not be generated');
    }

    // Initialize relayer services for each chain with relayer_url
    relayerServices = new Map();
    for (const chain of chainsWithTokens) {
      if (chain.relayer_url) {
        const apiKey = process.env[`RELAY_API_KEY_${chain.network_id}`] || '';
        const service = new RelayerService(chain.relayer_url, apiKey);
        relayerServices.set(chain.network_id, service);
        logger.info(`🔄 Relayer service initialized for chain ${chain.network_id} (${chain.name})`);
      }
    }
    if (relayerServices.size === 0) {
      logger.warn('⚠️  No chains with relayer_url found - gasless transactions will not work');
    }

    // Register all routes
    await registerRoutes();

    // Generate Swagger spec after all routes are registered
    await server.ready();

    const port = Number(process.env.PORT) || 3001;
    const host = process.env.HOST || '0.0.0.0';

    await server.listen({ port, host });
    logger.info(`🚀 Server running on http://${host}:${port}`);
    logger.info(`📚 Swagger UI available at http://${host}:${port}/api-docs`);
  } catch (err) {
    server.log.error(err);
    await disconnectPrisma();
    await disconnectRedis();
    process.exit(1);
  }
};

start();
