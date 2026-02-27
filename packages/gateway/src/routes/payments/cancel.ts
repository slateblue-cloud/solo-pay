import { FastifyInstance } from 'fastify';
import { Hex, encodeFunctionData, Address } from 'viem';
import { MerchantService } from '../../services/merchant.service';
import { PaymentService } from '../../services/payment.service';
import { ServerSigningService } from '../../services/signature-server.service';
import { BlockchainService } from '../../services/blockchain.service';
import { RelayerService } from '../../services/relayer.service';
import { createAuthMiddleware } from '../../middleware/auth.middleware';
import { ErrorResponseSchema } from '../../docs/schemas';

interface CancelPaymentParams {
  id: string;
}

const BYTES32_PATTERN = '^0x[a-fA-F0-9]{64}$';

const CANCEL_ABI = [
  {
    type: 'function',
    name: 'cancel',
    inputs: [
      { name: 'paymentId', type: 'bytes32' },
      { name: 'serverSignature', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

export async function cancelPaymentRoute(
  app: FastifyInstance,
  merchantService: MerchantService,
  paymentService: PaymentService,
  blockchainService: BlockchainService,
  signingServices: Map<number, ServerSigningService>,
  relayerServices: Map<number, RelayerService>
) {
  const authMiddleware = createAuthMiddleware(merchantService);

  app.post<{ Params: CancelPaymentParams }>(
    '/payments/:id/cancel',
    {
      schema: {
        operationId: 'cancelPayment',
        tags: ['Payment'],
        summary: 'Cancel an escrowed payment (API key auth)',
        description: `
Cancels an escrowed payment, returning full amount to the buyer.

**Requirements:**
- Payment must be in ESCROWED status
- Payment must belong to the authenticated merchant

**Flow:**
1. Validate payment status and ownership
2. Generate CancelRequest server signature
3. Submit cancel transaction to blockchain via relayer
4. Return transaction submission result

Note: After escrow deadline, anyone can cancel permissionlessly on-chain without this API.
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
            message: `Payment must be ESCROWED to cancel. Current status: ${payment.status}`,
          });
        }

        // 4. Optimistic lock: ensure no concurrent finalize/cancel
        const claimed = await paymentService.claimForProcessing(
          payment.id,
          'ESCROWED',
          'CANCEL_SUBMITTED'
        );
        if (!claimed) {
          return reply.code(409).send({
            code: 'CONFLICT',
            message: 'Payment is already being processed by another request',
          });
        }

        // 5. Get chain contracts
        const chainContracts = blockchainService.getChainContracts(payment.network_id);
        if (!chainContracts || !chainContracts.gateway) {
          return reply.code(500).send({
            code: 'CHAIN_CONFIG_ERROR',
            message: 'Chain configuration not found',
          });
        }

        // 6. Get signing service
        const signingService = signingServices.get(payment.network_id);
        if (!signingService) {
          return reply.code(500).send({
            code: 'SIGNING_SERVICE_ERROR',
            message: 'Signing service not available for this chain',
          });
        }

        // 7. Get relayer service
        const relayerService = relayerServices.get(payment.network_id);
        if (!relayerService) {
          return reply.code(500).send({
            code: 'RELAYER_ERROR',
            message: 'Relayer service not available for this chain',
          });
        }

        // 8. Generate cancel signature
        const serverSignature = await signingService.signCancelRequest(paymentId as Hex);

        // 9. Encode cancel calldata
        const calldata = encodeFunctionData({
          abi: CANCEL_ABI,
          functionName: 'cancel',
          args: [paymentId as Hex, serverSignature],
        });

        // 10. Submit via relayer
        const relayResult = await relayerService.submitDirectTransaction(
          chainContracts.gateway as Address,
          calldata
        );

        // 11. Create audit event
        await paymentService.createEvent(payment.id, 'CANCEL_SUBMITTED');

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
        request.log.error({ err: error }, 'Failed to cancel payment');
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message: 'Failed to cancel payment',
        });
      }
    }
  );
}
