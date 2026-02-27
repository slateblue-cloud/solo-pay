import { FastifyInstance } from 'fastify';
import { Address, Hex } from 'viem';
import { PaymentService } from '../../services/payment.service';
import { MerchantService } from '../../services/merchant.service';
import { ChainService } from '../../services/chain.service';
import { TokenService } from '../../services/token.service';
import { PaymentMethodService } from '../../services/payment-method.service';
import { ServerSigningService } from '../../services/signature-server.service';
import { createPublicAuthMiddleware } from '../../middleware/public-auth.middleware';
import { ErrorResponseSchema } from '../../docs/schemas';

/**
 * GET /payments/:id/details
 *
 * Returns the full payment details needed for the widget to resume a payment flow.
 * Re-derives all fields (gatewayAddress, merchantId, etc.) from related records
 * and re-signs with a fresh deadline.
 *
 * For terminal statuses (CONFIRMED, FAILED, EXPIRED, FINALIZED, CANCELLED),
 * returns details without a fresh signature (payment can't proceed anyway).
 */
export async function getPaymentDetailsRoute(
  app: FastifyInstance,
  paymentService: PaymentService,
  merchantService: MerchantService,
  chainService: ChainService,
  tokenService: TokenService,
  paymentMethodService: PaymentMethodService,
  signingServices?: Map<number, ServerSigningService>
) {
  const authMiddleware = createPublicAuthMiddleware(merchantService);

  app.get<{
    Params: { id: string };
  }>(
    '/payments/:id/details',
    {
      schema: {
        operationId: 'getPaymentDetails',
        tags: ['Payment'],
        summary: 'Get full payment details for widget resume',
        description: `
Returns the full payment details needed for the widget to resume a payment flow using only \`pk\` and \`paymentId\`.

Re-derives all fields (gatewayAddress, merchantId, recipientAddress, etc.) from related records and generates a fresh server signature with a new deadline.

For terminal statuses (CONFIRMED, FAILED, EXPIRED, FINALIZED, CANCELLED), returns details without a fresh signature.

**Auth:** \`x-public-key\` header required.
        `,
        headers: {
          type: 'object',
          properties: {
            'x-public-key': {
              type: 'string',
              description: 'Public key (pk_live_xxx or pk_test_xxx)',
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
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              paymentId: { type: 'string' },
              orderId: { type: 'string' },
              serverSignature: { type: 'string' },
              chainId: { type: 'integer' },
              tokenAddress: { type: 'string' },
              gatewayAddress: { type: 'string' },
              amount: { type: 'string', description: 'Wei' },
              tokenDecimals: { type: 'integer' },
              tokenSymbol: { type: 'string' },
              successUrl: { type: 'string' },
              failUrl: { type: 'string' },
              expiresAt: { type: 'string', format: 'date-time' },
              recipientAddress: { type: 'string' },
              merchantId: { type: 'string' },
              feeBps: { type: 'integer' },
              deadline: { type: 'string' },
              escrowDuration: { type: 'string' },
              forwarderAddress: { type: 'string' },
              tokenPermitSupported: { type: 'boolean' },
              currency: { type: 'string' },
              fiatAmount: { type: 'number' },
              tokenPrice: { type: 'number' },
              status: { type: 'string' },
            },
          },
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

        // Look up payment
        const paymentData = await paymentService.findByHash(id);
        if (!paymentData) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Payment not found',
          });
        }

        // Validate payment belongs to the authenticated merchant
        const requestMerchant = (request as { merchant?: { id: number } }).merchant;
        if (requestMerchant && paymentData.merchant_id !== requestMerchant.id) {
          return reply.code(403).send({
            code: 'FORBIDDEN',
            message: 'Payment does not belong to this merchant',
          });
        }

        const [merchant, chain, paymentMethod] = await Promise.all([
          merchantService.findById(paymentData.merchant_id),
          chainService.findByNetworkId(paymentData.network_id),
          paymentMethodService.findById(paymentData.payment_method_id),
        ]);

        if (!merchant) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Merchant not found',
          });
        }

        if (!chain) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Chain not found',
          });
        }

        if (!paymentMethod) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Payment method not found',
          });
        }

        const token = await tokenService.findById(paymentMethod.token_id);
        if (!token) {
          return reply.code(404).send({
            code: 'NOT_FOUND',
            message: 'Token not found',
          });
        }

        const merchantId = ServerSigningService.merchantKeyToId(merchant.merchant_key);
        const recipientAddress = merchant.recipient_address as Address | null;
        const amountInWei = BigInt(paymentData.amount.toString());
        const defaultEscrowDuration = Number(process.env.DEFAULT_ESCROW_DURATION) || 300;
        const escrowDuration = BigInt(merchant.escrow_duration ?? defaultEscrowDuration);

        const terminalStatuses = ['CONFIRMED', 'FAILED', 'EXPIRED', 'FINALIZED', 'CANCELLED'];
        const isTerminal = terminalStatuses.includes(paymentData.status);

        // For active payments, generate a fresh signature with a new deadline
        let serverSignature: Hex | string = '';
        let deadline = BigInt(0);

        if (!isTerminal) {
          const deadlineTtl = Number(process.env.PAYMENT_DEADLINE_SECONDS) || 3600;
          deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineTtl);

          const signingService = signingServices?.get(paymentData.network_id);
          if (signingService && recipientAddress) {
            try {
              serverSignature = await signingService.signPaymentRequest(
                id as Hex,
                token.address as Address,
                amountInWei,
                recipientAddress,
                merchantId,
                merchant.fee_bps,
                deadline,
                escrowDuration
              );
            } catch (err) {
              app.log.error({ err }, 'Failed to generate server signature for payment details');
              return reply.code(500).send({
                code: 'SIGNATURE_ERROR',
                message: 'Failed to generate payment signature',
              });
            }
          }
        }

        return reply.code(200).send({
          success: true,
          paymentId: paymentData.payment_hash,
          orderId: paymentData.order_id ?? '',
          serverSignature,
          chainId: paymentData.network_id,
          tokenAddress: token.address,
          gatewayAddress: chain.gateway_address ?? '',
          amount: amountInWei.toString(),
          tokenDecimals: paymentData.token_decimals,
          tokenSymbol: paymentData.token_symbol,
          successUrl: paymentData.success_url ?? '',
          failUrl: paymentData.fail_url ?? '',
          expiresAt: new Date(paymentData.expires_at).toISOString(),
          recipientAddress: recipientAddress ?? '',
          merchantId,
          feeBps: merchant.fee_bps,
          deadline: deadline.toString(),
          escrowDuration: escrowDuration.toString(),
          forwarderAddress: chain.forwarder_address ?? undefined,
          tokenPermitSupported: token.permit_enabled ?? false,
          currency: paymentData.currency_code ?? undefined,
          fiatAmount: paymentData.fiat_amount ? Number(paymentData.fiat_amount) : undefined,
          tokenPrice: paymentData.token_price ? Number(paymentData.token_price) : undefined,
          status: paymentData.status,
          txHash: paymentData.tx_hash ?? undefined,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to get payment details';
        return reply.code(500).send({
          code: 'INTERNAL_ERROR',
          message,
        });
      }
    }
  );
}
