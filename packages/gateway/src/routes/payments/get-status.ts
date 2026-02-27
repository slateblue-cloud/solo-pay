import { FastifyInstance } from 'fastify';
import { BlockchainService } from '../../services/blockchain.service';
import { PaymentService } from '../../services/payment.service';
import { MerchantService } from '../../services/merchant.service';
import { createPublicAuthMiddleware } from '../../middleware/public-auth.middleware';
import { PaymentStatusResponseSchema, ErrorResponseSchema } from '../../docs/schemas';

export async function getPaymentStatusRoute(
  app: FastifyInstance,
  blockchainService: BlockchainService,
  paymentService: PaymentService,
  merchantService: MerchantService
) {
  const authMiddleware = createPublicAuthMiddleware(merchantService);

  app.get<{
    Params: { id: string };
  }>(
    '/payments/:id',
    {
      schema: {
        operationId: 'getPaymentStatus',
        tags: ['Payment'],
        summary: 'Get payment status',
        description: `
Retrieves the current status of a payment by its payment hash. Requires x-public-key. Origin is verified against ALLOWED_WIDGET_ORIGIN when configured.

**Status Values:**
- \`CREATED\` - Payment created, awaiting on-chain transaction
- \`PENDING\` - Transaction submitted, awaiting confirmation
- \`ESCROWED\` - Payment escrowed on-chain, awaiting merchant decision
- \`FINALIZE_SUBMITTED\` - Merchant submitted finalize request
- \`CANCEL_SUBMITTED\` - Merchant submitted cancel request
- \`CONFIRMED\` - Payment confirmed on-chain (direct flow, no escrow)
- \`FINALIZED\` - Escrowed payment released to merchant
- \`CANCELLED\` - Escrowed payment refunded to buyer
- \`FAILED\` - Payment failed

**Note:** This endpoint syncs on-chain status with database status.
        `,
        headers: {
          type: 'object',
          properties: {
            'x-public-key': {
              type: 'string',
              description: 'Public key (pk_live_xxx or pk_test_xxx)',
            },
            'x-origin': {
              type: 'string',
              description:
                'Origin for this GET endpoint (proxy often strips Origin). Verified against ALLOWED_WIDGET_ORIGIN when configured.',
            },
          },
        },
        params: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Payment hash (bytes32)',
            },
          },
          required: ['id'],
        },
        response: {
          200: PaymentStatusResponseSchema,
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

        if (!id || typeof id !== 'string') {
          return reply.code(400).send({
            code: 'INVALID_REQUEST',
            message: 'Payment ID is required',
          });
        }

        const paymentData = await paymentService.findByHash(id);

        if (!paymentData) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Payment not found',
          });
        }

        // Validate payment belongs to the authenticated merchant
        const merchant = request.merchant;
        if (merchant && paymentData.merchant_id !== merchant.id) {
          return reply.code(403).send({
            code: 'FORBIDDEN',
            message: 'Payment does not belong to this merchant',
          });
        }

        const chainIdNum = paymentData.network_id;

        if (!blockchainService.isChainSupported(chainIdNum)) {
          return reply.code(400).send({
            code: 'UNSUPPORTED_CHAIN',
            message: 'Unsupported chain',
          });
        }

        const paymentStatus = await blockchainService.getPaymentStatus(chainIdNum, id);

        if (!paymentStatus) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Payment not found',
          });
        }

        if (paymentStatus.status !== 'pending' && paymentStatus.amount) {
          const eventAmount = BigInt(paymentStatus.amount);
          const dbAmount = BigInt(paymentData.amount.toString());

          if (eventAmount !== dbAmount) {
            return reply.code(400).send({
              code: 'AMOUNT_MISMATCH',
              message: `Payment amount mismatch. DB: ${dbAmount.toString()}, on-chain: ${eventAmount.toString()}`,
              details: {
                dbAmount: dbAmount.toString(),
                onChainAmount: eventAmount.toString(),
                paymentId: id,
                transactionHash: paymentStatus.transactionHash,
              },
            });
          }
        }

        let finalStatus = paymentData.status;

        // Sync on-chain status → DB status
        const onChain = paymentStatus.status;
        const dbStatus = paymentData.status;

        const shouldSync =
          (onChain === 'escrowed' && ['CREATED', 'PENDING'].includes(dbStatus)) ||
          (onChain === 'finalized' && ['ESCROWED', 'FINALIZE_SUBMITTED'].includes(dbStatus)) ||
          (onChain === 'cancelled' && ['ESCROWED', 'CANCEL_SUBMITTED'].includes(dbStatus));

        if (shouldSync) {
          const newStatus =
            onChain === 'escrowed'
              ? 'ESCROWED'
              : onChain === 'finalized'
                ? 'FINALIZED'
                : 'CANCELLED';
          // For FINALIZED/CANCELLED, pass releaseTxHash; for ESCROWED, pass escrow txHash
          const isRelease = newStatus === 'FINALIZED' || newStatus === 'CANCELLED';
          const txHashToStore = isRelease
            ? paymentStatus.releaseTxHash
            : paymentStatus.transactionHash;
          await paymentService.updateStatusByHash(
            paymentData.payment_hash,
            newStatus as import('@solo-pay/database').PaymentStatus,
            txHashToStore
          );
          if (paymentStatus.payerAddress) {
            await paymentService.updatePayerAddress(id, paymentStatus.payerAddress);
          }
          finalStatus = newStatus;
        }

        const tokenPermitSupported = await paymentService.getTokenPermitSupported(
          paymentData.payment_method_id
        );

        return reply.code(200).send({
          success: true,
          data: {
            ...paymentStatus,
            payment_hash: paymentData.payment_hash,
            network_id: paymentData.network_id,
            token_symbol: paymentData.token_symbol,
            status: finalStatus,
            tokenPermitSupported,
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get payment status';
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message,
        });
      }
    }
  );
}
