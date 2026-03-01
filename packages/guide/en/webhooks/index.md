# Webhook

Receive real-time notifications when payment status changes.

## Webhook Overview

When configured, Webhooks send HTTP POST requests to your URL on payment status changes.

## Event Types

| Event               | Description      | When                       |
| ------------------- | ---------------- | -------------------------- |
| `payment.created`   | Payment created  | Immediately after creation |
| `payment.pending`   | Transaction sent | TX included in block       |
| `payment.confirmed` | Payment complete | After block confirmation   |
| `payment.failed`    | Payment failed   | On TX failure              |
| `payment.expired`   | Payment expired  | After 30 minutes           |

## Payload Structure

```json
{
  "event": "payment.confirmed",
  "timestamp": "2024-01-26T12:35:42Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "CONFIRMED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "payerAddress": "0x1234567890abcdef...",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "confirmedAt": "2024-01-26T12:35:42Z"
  }
}
```

## Headers

| Header         | Description        |
| -------------- | ------------------ |
| `Content-Type` | `application/json` |

## Merchant Webhook URL

The merchant data model has a `webhook_url` field. Contact admin to configure it.

## Next Steps

- [Payment Status](/en/payments/status) - Check status via polling
- [Error Codes](/en/api/errors) - Error handling
