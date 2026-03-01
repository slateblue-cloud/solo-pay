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

## payment.confirmed

::: tip Key Event
`payment.confirmed` is the most important event. Process order completion upon receiving it.
:::

```json
{
  "event": "payment.confirmed",
  "timestamp": "2024-01-26T12:35:42Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "CONFIRMED",
    "amount": "10500000000000000000",
    "tokenSymbol": "SUT",
    "payerAddress": "0x1234567890abcdef...",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "confirmedAt": "2024-01-26T12:35:42Z"
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
    case 'payment.confirmed':
      await completeOrder(data.orderId);
      await sendNotification(data.payerAddress, 'Payment complete');
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

- [API Reference](/en/api/) - Full API spec
- [Error Codes](/en/api/errors) - Error handling
