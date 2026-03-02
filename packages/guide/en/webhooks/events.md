# Event Details

## payment.created

```json
{
  "event": "payment.created",
  "timestamp": "2024-01-26T12:30:00Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "CREATED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "orderId": "order-001",
    "expiresAt": "2024-01-26T13:00:00Z"
  }
}
```

## payment.escrowed

Payment escrowed on-chain; user has paid and funds are held in escrow. Merchant can finalize (release to merchant) or cancel (return to buyer).

```json
{
  "event": "payment.escrowed",
  "timestamp": "2024-01-26T12:35:00Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "ESCROWED",
    "amount": "10500000000000000000",
    "tokenSymbol": "SUT",
    "payerAddress": "0x1234567890abcdef...",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "escrowedAt": "2024-01-26T12:35:00Z"
  }
}
```

## payment.finalized

Funds released to merchant. Terminal success state for the finalize flow.

```json
{
  "event": "payment.finalized",
  "timestamp": "2024-01-26T12:36:00Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "FINALIZED",
    "amount": "10500000000000000000",
    "tokenSymbol": "SUT",
    "payerAddress": "0x1234567890abcdef...",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "finalizedAt": "2024-01-26T12:36:00Z"
  }
}
```

## payment.cancelled

Escrowed payment was cancelled; funds returned to buyer.

```json
{
  "event": "payment.cancelled",
  "timestamp": "2024-01-26T12:36:00Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "CANCELLED",
    "orderId": "order-001",
    "cancelledAt": "2024-01-26T12:36:00Z"
  }
}
```

## payment.failed

```json
{
  "event": "payment.failed",
  "data": {
    "paymentId": "0xabc123...",
    "status": "FAILED",
    "orderId": "order-001",
    "failureReason": "Transaction reverted"
  }
}
```

## payment.expired

```json
{
  "event": "payment.expired",
  "data": {
    "paymentId": "0xabc123...",
    "status": "EXPIRED",
    "orderId": "order-001",
    "expiredAt": "2024-01-26T13:00:00Z"
  }
}
```

## Event Handler Example

```typescript
async function handleWebhook(event: any) {
  const { event: eventType, data } = event;

  switch (eventType) {
    case 'payment.created':
      await updateOrderStatus(data.orderId, 'PENDING_PAYMENT');
      break;
    case 'payment.escrowed':
      await updateOrderStatus(data.orderId, 'PAID_ESCROW');
      // Optionally complete order here, or wait for payment.finalized
      break;
    case 'payment.finalized':
      await completeOrder(data.orderId);
      await sendNotification(data.payerAddress, 'Payment complete');
      break;
    case 'payment.cancelled':
      await cancelOrder(data.orderId);
      break;
    case 'payment.failed':
      await updateOrderStatus(data.orderId, 'PAYMENT_FAILED');
      break;
    case 'payment.expired':
      await cancelOrder(data.orderId);
      break;
  }
}
```

## Next Steps

- [Payment Status](/en/payments/status) - All status values
- [Finalize & Cancel](/en/payments/finalize) - Release or cancel after escrowed
- [API Reference](/en/api/) - Full API spec
- [Error Codes](/en/api/errors) - Error handling
