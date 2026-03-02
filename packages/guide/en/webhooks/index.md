# Webhook

Receive real-time notifications when payment status changes.

## Webhook Overview

When configured, Webhooks send HTTP POST requests to your URL on payment status changes.

## Event Types

| Event               | Description       | When                       |
| ------------------- | ----------------- | -------------------------- |
| `payment.created`   | Payment created   | Immediately after creation |
| `payment.escrowed`  | Payment escrowed  | User paid; funds in escrow |
| `payment.finalized` | Payment finalized | Funds released to merchant |
| `payment.cancelled` | Payment cancelled | Funds returned to buyer    |
| `payment.failed`    | Payment failed    | On TX failure              |
| `payment.expired`   | Payment expired   | After 30 minutes exceeded  |

Payment is considered complete when you receive **payment.escrowed** (user paid, funds in escrow) and/or **payment.finalized** (funds released to your wallet). Process order completion based on your policy: on ESCROWED or on FINALIZED.

## Payload Structure

```json
{
  "event": "payment.finalized",
  "timestamp": "2024-01-26T12:35:42Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "FINALIZED",
    "amount": "10500000000000000000",
    "tokenSymbol": "SUT",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "finalizedAt": "2024-01-26T12:35:42Z"
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

- [Event Details](/en/webhooks/events) - payment.escrowed, payment.finalized, payment.cancelled
- [Payment Status](/en/payments/status) - Check status via polling
- [Error Codes](/en/api/errors) - Error handling
