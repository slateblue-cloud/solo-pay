import { z } from 'zod';

const PRIVATE_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/,
  /^0\.0\.0\.0$/,
  /^\[::1\]$/,
  /^\[fc/i,
  /^\[fd/i,
  /^\[fe80:/i,
  /^metadata\.google\.internal$/i,
];

/**
 * Validates that a webhook URL is safe (HTTPS only, no private/internal hosts).
 */
export function isWebhookUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const hostname = parsed.hostname;
    return !PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname));
  } catch {
    return false;
  }
}

const safeWebhookUrl = z
  .string()
  .url('Webhook URL must be a valid URL')
  .refine(
    isWebhookUrlSafe,
    'Webhook URL must use HTTPS and must not point to private/internal addresses'
  );

// Merchant update request schema. merchant_key is not updatable.
export const UpdateMerchantSchema = z
  .object({
    name: z.string().min(1, 'Merchant name is required').optional(),
    chain_id: z.number().int().positive().optional(),
    webhook_url: safeWebhookUrl.optional(),
  })
  .strict(); // Reject unknown keys (e.g. merchant_key) so merchant_key cannot be updated via API

export type UpdateMerchantRequest = z.infer<typeof UpdateMerchantSchema>;
