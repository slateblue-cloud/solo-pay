import { FastifyRequest, FastifyReply } from 'fastify';
import { Merchant } from '@solo-pay/database';
import { MerchantService } from '../services/merchant.service';

declare module 'fastify' {
  interface FastifyRequest {
    merchant?: Merchant;
  }
}

const ALLOWED_WIDGET_ORIGIN = (process.env.ALLOWED_WIDGET_ORIGIN || '').trim();

/**
 * Resolve origin from request: Origin header, or x-origin when Origin is stripped (e.g. GET behind some proxies).
 */
function resolveOrigin(request: FastifyRequest): string {
  const origin = request.headers['origin'] as string | undefined;
  if (origin && origin.trim()) return origin.trim();
  const xOrigin = request.headers['x-origin'] as string | undefined;
  if (xOrigin && xOrigin.trim()) return xOrigin.trim();
  return '';
}

/**
 * Public Key authentication middleware for client-side integration.
 * Validates x-public-key header, resolves merchant by public key hash,
 * and verifies request Origin matches ALLOWED_WIDGET_ORIGIN env.
 * Sets request.merchant on success; returns 401 for invalid/missing key, 403 for origin mismatch.
 */
export function createPublicAuthMiddleware(merchantService: MerchantService) {
  return async function publicAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const publicKey = request.headers['x-public-key'] as string | undefined;

    if (!publicKey || publicKey.trim() === '') {
      return reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid x-public-key header',
      });
    }

    try {
      const merchant = await merchantService.findByPublicKey(publicKey);

      if (!merchant) {
        return reply.code(401).send({
          code: 'UNAUTHORIZED',
          message: 'Invalid public key',
        });
      }

      if (ALLOWED_WIDGET_ORIGIN) {
        const origin = resolveOrigin(request);
        if (!origin || origin !== ALLOWED_WIDGET_ORIGIN) {
          return reply.code(403).send({
            code: 'FORBIDDEN',
            message: 'Origin not allowed',
          });
        }
      }

      request.merchant = merchant;
    } catch (error) {
      request.log.error(error, 'Public key authentication failed due to an internal error');
      return reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message: 'Authentication failed',
      });
    }
  };
}
