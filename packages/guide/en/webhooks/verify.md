# Payment Result Verification

How to verify payment information from Webhook events.

## Verification Method

Use the `paymentId` in the Webhook payload to call the SoloPay API directly from your server and confirm the payment status.

::: warning Always Verify from the Server
Do not trust Webhook payload contents directly. Always re-confirm the actual payment status via the API.
:::

```bash
curl https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

**Verification Checklist**

- [ ] Confirm `status === 'ESCROWED'` or `status === 'FINALIZED'` (payment success)
- [ ] Confirm `amount` matches order amount
- [ ] Confirm `orderId` matches orderId stored in DB
- [ ] Prevent duplicate processing for the same `paymentId`

## Idempotency

The same event may be sent multiple times. Use `paymentId` to prevent duplicate processing.

```typescript
// Check if this paymentId was already processed (DB lookup)
const alreadyProcessed = await db.orders.isPaymentProcessed(data.paymentId);
if (alreadyProcessed) {
  return res.status(200).json({ received: true }); // Ignore duplicate event
}
```

## Next Steps

- [Event Details](/en/webhooks/events) - Per-event processing
- [API Reference](/en/api/) - Full API spec
