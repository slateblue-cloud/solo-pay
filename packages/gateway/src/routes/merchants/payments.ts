import { FastifyInstance } from 'fastify';
import { Payment } from '@solo-pay/database';
import { BlockchainService } from '../../services/blockchain.service';
import { PaymentService } from '../../services/payment.service';
import { createAuthMiddleware } from '../../middleware/auth.middleware';
import { MerchantService } from '../../services/merchant.service';
import { ErrorResponseSchema } from '../../docs/schemas';

/**
 * Syncs payment status from blockchain based on on-chain state.
 * Handles: CREATED/PENDING→ESCROWED, ESCROWED/FINALIZE_SUBMITTED→FINALIZED,
 *          ESCROWED/CANCEL_SUBMITTED→CANCELLED.
 * Mutates the payment object in place. Returns true if DB status was updated.
 */
async function syncPaymentStatusFromChain(
  blockchainService: BlockchainService,
  paymentService: PaymentService,
  payment: Payment
): Promise<boolean> {
  const chainId = payment.network_id;
  if (!blockchainService.isChainSupported(chainId)) {
    return false;
  }
  const chainStatus = await blockchainService.getPaymentStatus(chainId, payment.payment_hash);
  if (!chainStatus || chainStatus.status === 'pending') {
    return false;
  }

  const onChain = chainStatus.status;
  const dbStatus = payment.status;

  type PaymentStatus = import('@solo-pay/database').PaymentStatus;

  const syncMap: Record<string, { from: string[]; to: PaymentStatus } | undefined> = {
    escrowed: { from: ['CREATED'], to: 'ESCROWED' },
    finalized: { from: ['ESCROWED', 'FINALIZE_SUBMITTED'], to: 'FINALIZED' },
    cancelled: { from: ['ESCROWED', 'CANCEL_SUBMITTED'], to: 'CANCELLED' },
  };

  const rule = syncMap[onChain];
  if (!rule || !rule.from.includes(dbStatus)) {
    return false;
  }

  // For FINALIZED/CANCELLED, pass the release txHash; for ESCROWED, pass the escrow txHash
  const isRelease = rule.to === 'FINALIZED' || rule.to === 'CANCELLED';
  const txHashToStore = isRelease
    ? (chainStatus.releaseTxHash ?? undefined)
    : (chainStatus.transactionHash ?? undefined);

  const updated = await paymentService.updateStatusByHash(
    payment.payment_hash,
    rule.to,
    txHashToStore
  );
  payment.status = updated.status;
  payment.tx_hash = updated.tx_hash;
  payment.release_tx_hash = updated.release_tx_hash;
  payment.confirmed_at = updated.confirmed_at ?? payment.confirmed_at;
  if (chainStatus.payerAddress) {
    const withPayer = await paymentService.updatePayerAddress(
      payment.payment_hash,
      chainStatus.payerAddress
    );
    payment.payer_address = withPayer.payer_address ?? payment.payer_address;
  }
  return true;
}

function buildPaymentDetailResponse(
  payment: {
    payment_hash: string;
    order_id: string | null;
    status: string;
    amount: { toString: () => string };
    token_symbol: string;
    token_decimals: number;
    tx_hash: string | null;
    release_tx_hash: string | null;
    payer_address: string | null;
    currency_code: string | null;
    fiat_amount: { toString: () => string } | null;
    created_at: Date;
    confirmed_at: Date | null;
    expires_at: Date;
  },
  tokenPermitSupported: boolean
) {
  return {
    paymentId: payment.payment_hash,
    orderId: payment.order_id ?? undefined,
    status: payment.status,
    amount: payment.amount.toString(),
    tokenSymbol: payment.token_symbol,
    tokenDecimals: payment.token_decimals,
    txHash: payment.tx_hash ?? undefined,
    releaseTxHash: payment.release_tx_hash ?? undefined,
    payerAddress: payment.payer_address ?? undefined,
    currencyCode: payment.currency_code ?? undefined,
    fiatAmount: payment.fiat_amount?.toString() ?? undefined,
    createdAt: payment.created_at.toISOString(),
    confirmedAt: payment.confirmed_at?.toISOString() ?? undefined,
    expiresAt: payment.expires_at.toISOString(),
    tokenPermitSupported,
  };
}

export async function merchantPaymentRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService,
  merchantService: MerchantService,
  paymentService: PaymentService
) {
  const authMiddleware = createAuthMiddleware(merchantService);

  const detailResponseSchema = {
    type: 'object',
    properties: {
      paymentId: { type: 'string' },
      orderId: { type: 'string' },
      status: {
        type: 'string',
        enum: [
          'CREATED',

          'ESCROWED',
          'FINALIZE_SUBMITTED',
          'CANCEL_SUBMITTED',
          'FINALIZED',
          'FINALIZED',
          'CANCELLED',
          'FAILED',
          'EXPIRED',
        ],
      },
      amount: { type: 'string', description: 'Wei' },
      tokenSymbol: { type: 'string' },
      tokenDecimals: { type: 'integer' },
      txHash: { type: 'string' },
      releaseTxHash: { type: 'string', description: 'Finalize/cancel transaction hash' },
      payerAddress: { type: 'string' },
      currencyCode: { type: 'string', description: 'Fiat currency code (e.g. USD)' },
      fiatAmount: { type: 'string', description: 'Original fiat amount before conversion' },
      tokenPermitSupported: {
        type: 'boolean',
        description: 'Whether the token supports EIP-2612 permit (gasless approval)',
      },
      createdAt: { type: 'string', format: 'date-time' },
      confirmedAt: { type: 'string', format: 'date-time' },
      expiresAt: { type: 'string', format: 'date-time' },
    },
  };

  // GET /merchant/payments?orderId=xxx – API Key, findByOrderId
  app.get<{ Querystring: { orderId?: string } }>(
    '/merchant/payments',
    {
      schema: {
        operationId: 'getMerchantPaymentByOrderId',
        tags: ['Merchant'],
        summary: 'Get payment by order ID',
        description: 'Retrieves payment by merchant order ID. API Key required.',
        security: [{ ApiKeyAuth: [] }],
        querystring: {
          type: 'object',
          properties: { orderId: { type: 'string', description: 'Merchant order ID' } },
          required: ['orderId'],
        },
        response: {
          200: detailResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      try {
        const { orderId } = request.query;
        const merchant = (request as { merchant?: { id: number } }).merchant;
        if (!merchant) {
          return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Authentication required' });
        }

        if (!orderId || typeof orderId !== 'string') {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: 'orderId query parameter is required',
          });
        }

        const payment = await paymentService.findByOrderId(orderId, merchant.id);
        if (!payment) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Payment not found for this order ID',
          });
        }

        await syncPaymentStatusFromChain(blockchainService, paymentService, payment);
        const tokenPermitSupported = await paymentService.getTokenPermitSupported(
          payment.payment_method_id
        );

        return reply.code(200).send(buildPaymentDetailResponse(payment, tokenPermitSupported));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get payment';
        return reply.code(500).send({ code: 'INTERNAL_ERROR', message });
      }
    }
  );

  // GET /merchant/payments/:id – API Key, merchant ownership, sync status
  app.get<{ Params: { id: string } }>(
    '/merchant/payments/:id',
    {
      schema: {
        operationId: 'getMerchantPaymentById',
        tags: ['Merchant'],
        summary: 'Get payment detail by ID',
        description:
          'Retrieves payment by payment hash. API Key required. Validates payment belongs to merchant. Syncs latest status from blockchain.',
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          properties: { id: { type: 'string', description: 'Payment hash' } },
          required: ['id'],
        },
        response: {
          200: detailResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const merchant = (request as { merchant?: { id: number } }).merchant;
        if (!merchant) {
          return reply.code(401).send({ code: 'UNAUTHORIZED', message: 'Authentication required' });
        }

        const payment = await paymentService.findByHash(id);
        if (!payment) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Payment not found',
          });
        }

        if (payment.merchant_id !== merchant.id) {
          return reply.code(403).send({
            code: 'FORBIDDEN',
            message: 'Payment does not belong to this merchant',
          });
        }

        await syncPaymentStatusFromChain(blockchainService, paymentService, payment);
        const tokenPermitSupported = await paymentService.getTokenPermitSupported(
          payment.payment_method_id
        );

        return reply.code(200).send(buildPaymentDetailResponse(payment, tokenPermitSupported));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get payment';
        return reply.code(500).send({ code: 'INTERNAL_ERROR', message });
      }
    }
  );
}
