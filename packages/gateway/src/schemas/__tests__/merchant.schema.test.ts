import { describe, it, expect } from 'vitest';
import { UpdateMerchantSchema, isWebhookUrlSafe } from '../merchant.schema';

describe('merchant.schema.ts', () => {
  describe('isWebhookUrlSafe', () => {
    describe('valid URLs', () => {
      it('should accept HTTPS URLs with public domains', () => {
        const validUrls = [
          'https://example.com/webhook',
          'https://api.merchant.com/callback',
          'https://webhook.site/123-456',
          'https://hooks.slack.com/services/abc',
        ];

        for (const url of validUrls) {
          expect(isWebhookUrlSafe(url)).toBe(true);
        }
      });
    });

    describe('invalid URLs - HTTP', () => {
      it('should reject HTTP URLs', () => {
        expect(isWebhookUrlSafe('http://example.com/webhook')).toBe(false);
      });
    });

    describe('invalid URLs - private/internal hosts', () => {
      it('should reject localhost', () => {
        expect(isWebhookUrlSafe('https://localhost/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://LOCALHOST/webhook')).toBe(false);
      });

      it('should reject 127.x.x.x addresses', () => {
        expect(isWebhookUrlSafe('https://127.0.0.1/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://127.0.0.255/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://127.255.255.255/webhook')).toBe(false);
      });

      it('should reject 10.x.x.x private addresses', () => {
        expect(isWebhookUrlSafe('https://10.0.0.1/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://10.255.255.255/webhook')).toBe(false);
      });

      it('should reject 172.16-31.x.x private addresses', () => {
        expect(isWebhookUrlSafe('https://172.16.0.1/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://172.31.255.255/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://172.20.0.1/webhook')).toBe(false);
      });

      it('should reject 192.168.x.x private addresses', () => {
        expect(isWebhookUrlSafe('https://192.168.0.1/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://192.168.1.100/webhook')).toBe(false);
      });

      it('should reject 169.254.x.x link-local addresses', () => {
        expect(isWebhookUrlSafe('https://169.254.0.1/webhook')).toBe(false);
      });

      it('should reject 0.0.0.0', () => {
        expect(isWebhookUrlSafe('https://0.0.0.0/webhook')).toBe(false);
      });

      it('should reject IPv6 localhost', () => {
        expect(isWebhookUrlSafe('https://[::1]/webhook')).toBe(false);
      });

      it('should reject IPv6 private addresses', () => {
        expect(isWebhookUrlSafe('https://[fc00::1]/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://[fd00::1]/webhook')).toBe(false);
        expect(isWebhookUrlSafe('https://[fe80::1]/webhook')).toBe(false);
      });

      it('should reject metadata.google.internal', () => {
        expect(isWebhookUrlSafe('https://metadata.google.internal/webhook')).toBe(false);
      });
    });

    describe('invalid URLs - malformed', () => {
      it('should reject invalid URLs', () => {
        expect(isWebhookUrlSafe('not-a-url')).toBe(false);
        expect(isWebhookUrlSafe('')).toBe(false);
        expect(isWebhookUrlSafe('ftp://example.com/webhook')).toBe(false);
      });
    });
  });

  describe('UpdateMerchantSchema', () => {
    describe('valid payloads', () => {
      it('should accept valid update with name only', () => {
        const result = UpdateMerchantSchema.safeParse({ name: 'New Store Name' });
        expect(result.success).toBe(true);
      });

      it('should accept valid update with chain_id only', () => {
        const result = UpdateMerchantSchema.safeParse({ chain_id: 137 });
        expect(result.success).toBe(true);
      });

      it('should accept valid update with webhook_url only', () => {
        const result = UpdateMerchantSchema.safeParse({
          webhook_url: 'https://merchant.com/webhook',
        });
        expect(result.success).toBe(true);
      });

      it('should accept valid update with all fields', () => {
        const result = UpdateMerchantSchema.safeParse({
          name: 'Updated Store',
          chain_id: 1,
          webhook_url: 'https://api.merchant.com/hooks',
        });
        expect(result.success).toBe(true);
      });

      it('should accept empty object (no updates)', () => {
        const result = UpdateMerchantSchema.safeParse({});
        expect(result.success).toBe(true);
      });
    });

    describe('invalid payloads', () => {
      it('should reject empty name', () => {
        const result = UpdateMerchantSchema.safeParse({ name: '' });
        expect(result.success).toBe(false);
      });

      it('should reject negative chain_id', () => {
        const result = UpdateMerchantSchema.safeParse({ chain_id: -1 });
        expect(result.success).toBe(false);
      });

      it('should reject zero chain_id', () => {
        const result = UpdateMerchantSchema.safeParse({ chain_id: 0 });
        expect(result.success).toBe(false);
      });

      it('should reject non-integer chain_id', () => {
        const result = UpdateMerchantSchema.safeParse({ chain_id: 1.5 });
        expect(result.success).toBe(false);
      });

      it('should reject HTTP webhook_url', () => {
        const result = UpdateMerchantSchema.safeParse({
          webhook_url: 'http://merchant.com/webhook',
        });
        expect(result.success).toBe(false);
      });

      it('should reject localhost webhook_url', () => {
        const result = UpdateMerchantSchema.safeParse({
          webhook_url: 'https://localhost/webhook',
        });
        expect(result.success).toBe(false);
      });

      it('should reject private IP webhook_url', () => {
        const result = UpdateMerchantSchema.safeParse({
          webhook_url: 'https://192.168.1.1/webhook',
        });
        expect(result.success).toBe(false);
      });

      it('should reject invalid URL format', () => {
        const result = UpdateMerchantSchema.safeParse({
          webhook_url: 'not-a-url',
        });
        expect(result.success).toBe(false);
      });

      it('should reject unknown fields (strict mode)', () => {
        const result = UpdateMerchantSchema.safeParse({
          name: 'Store',
          merchant_key: 'merchant_new_key',
        });
        expect(result.success).toBe(false);
      });

      it('should reject api_key field', () => {
        const result = UpdateMerchantSchema.safeParse({
          api_key: 'new_api_key',
        });
        expect(result.success).toBe(false);
      });
    });
  });
});
