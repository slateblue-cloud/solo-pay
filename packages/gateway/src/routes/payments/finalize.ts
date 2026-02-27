import { FastifyInstance } from 'fastify';
import { Hex, encodeFunctionData, Address } from 'viem';
import { MerchantService } from '../../services/merchant.service';
import { PaymentService } from '../../services/payment.service';
import { ServerSigningService } from '../../services/signature-server.service';
import { BlockchainService } from '../../services/blockchain.service';
import { RelayerService } from '../../services/relayer.service';
import { createAuthMiddleware } from '../../middleware/auth.middleware';
import { ErrorResponseSchema } from '../../docs/schemas';

interface FinalizePaymentParams {
  id: string;
}

const BYTES32_PATTERN = '^0x[a-fA-F0-9]{64}$';

const FINALIZE_ABI = [
  {
    type: 'function',
    name: 'finalize',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'serverSignature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export async function finalizePaymentRoute(
  app: FastifyInstance,
  merchantService: MerchantService,
  paymentService: PaymentService,
  blockchainService: BlockchainService,
  signingServices: Map<number, ServerSigningService>,
  relayerServices: Map<number, RelayerService>
) {
  const authMiddleware = createAuthMiddleware(merchantService);

  app.post<{ Params: FinalizePaymentParams }>(
    '/payments/:id/finalize',
    {
      schema: {
        operationId: 'finalizePayment',
        tags: ['Payment'],
        summary: 'Finalize an escrowed payment (API key auth)',
        description: `
Finalizes an escrowed payment, releasing funds to the merchant.

**Requirements:**
- Payment must be in ESCROWED status
- Payment must belong to the authenticated merchant
- Must be called before the escrow deadline

**Flow:**
1. Validate payment status and ownership
2. Generate FinalizeRequest server signature
3. Submit finalize transaction to blockchain via relayer
4. Return transaction submission result
        `,
        security: [{ ApiKeyAuth: [] }],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: {
              type: 'string',
              pattern: BYTES32_PATTERN,
              description: 'Payment hash (bytes32)',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  paymentId: { type: 'string' },
                  relayRequestId: { type: 'string' },
                  transactionHash: { type: 'string' },
                  status: { type: 'string' },
                },
              },
            },
          },
          400: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
          500: ErrorResponseSchema,
        },
      },
      preHandler: authMiddleware,
    },
    async (request, reply) => {
      try {
        const { id: paymentId } = request.params;
        const merchant = (request as unknown as { merchant: { id: number; merchant_key: string } })
          .merchant;

        // 1. Find payment
        const payment = await paymentService.findByHash(paymentId);
        if (!payment) {
          return reply.code(404).send({
            code: 'PAYMENT_NOT_FOUND',
            message: 'Payment not found',
          });
        }

        // 2. Verify merchant ownership
        if (payment.merchant_id !== merchant.id) {
          return reply.code(403).send({
            code: 'FORBIDDEN',
            message: 'Payment does not belong to this merchant',
          });
        }

        // 3. Check payment status
        if (payment.status !== 'ESCROWED') {
          return reply.code(400).send({
            code: 'INVALID_STATUS',
            message: `Payment must be ESCROWED to finalize. Current status: ${payment.status}`,
          });
        }

        // 4. Check escrow deadline
        if (payment.escrow_deadline && new Date(payment.escrow_deadline) < new Date()) {
          return reply.code(400).send({
            code: 'ESCROW_EXPIRED',
            message: 'Escrow deadline has expired',
          });
        }

        // 5. Optimistic lock: ensure no concurrent finalize/cancel
        const claimed = await paymentService.claimForProcessing(
          payment.id,
          'ESCROWED',
          'FINALIZE_SUBMITTED'
        );
        if (!claimed) {
          return reply.code(409).send({
            code: 'CONFLICT',
            message: 'Payment is already being processed by another request',
          });
        }

        // 6. Get chain contracts
        const chainContracts = blockchainService.getChainContracts(payment.network_id);
        if (!chainContracts || !chainContracts.gateway) {
          return reply.code(500).send({
            code: 'CHAIN_CONFIG_ERROR',
            message: 'Chain configuration not found',
          });
        }

        // 7. Get signing service
        const signingService = signingServices.get(payment.network_id);
        if (!signingService) {
          return reply.code(500).send({
            code: 'SIGNING_SERVICE_ERROR',
            message: 'Signing service not available for this chain',
          });
        }

        // 8. Get relayer service
        const relayerService = relayerServices.get(payment.network_id);
        if (!relayerService) {
          return reply.code(500).send({
            code: 'RELAYER_ERROR',
            message: 'Relayer service not available for this chain',
          });
        }

        // 9. Generate finalize signature
        const serverSignature = await signingService.signFinalizeRequest(paymentId as Hex);

        // 10. Encode finalize calldata
        const calldata = encodeFunctionData({
          abi: FINALIZE_ABI,
          functionName: 'finalize',
          args: [paymentId as Hex, serverSignature],
        });

        // 11. Submit via relayer
        const relayResult = await relayerService.submitDirectTransaction(
          chainContracts.gateway as Address,
          calldata
        );

        // 12. Create audit event
        await paymentService.createEvent(payment.id, 'FINALIZE_SUBMITTED');

        return reply.code(200).send({
          success: true,
          data: {
            paymentId: payment.payment_hash,
            relayRequestId: relayResult.relayRequestId,
            transactionHash: relayResult.transactionHash,
            status: relayResult.status,
          },
        });
      } catch (error) {
        request.log.error({ err: error }, 'Failed to finalize payment');
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message: 'Failed to finalize payment',
        });
      }
    }
  );
}
