# 이벤트 상세

각 Webhook 이벤트의 상세 정보입니다.

## payment.created

결제가 생성되었을 때 발생합니다.

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
    "expiresAt": "2024-01-26T13:00:00Z",
    "createdAt": "2024-01-26T12:30:00Z"
  }
}
```

## payment.confirmed

결제가 완료되었을 때 발생합니다. (블록 확정)

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

::: tip 핵심 이벤트
`payment.confirmed`가 가장 중요한 이벤트입니다. 이 이벤트를 받으면 주문을 완료 처리하세요.
:::

## payment.failed

트랜잭션이 실패했을 때 발생합니다.

```json
{
  "event": "payment.failed",
  "timestamp": "2024-01-26T12:35:00Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "FAILED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "payerAddress": "0x1234567890abcdef...",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "failureReason": "Transaction reverted"
  }
}
```

## payment.expired

결제가 만료되었을 때 발생합니다. (30분 초과)

```json
{
  "event": "payment.expired",
  "timestamp": "2024-01-26T13:00:00Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "EXPIRED",
    "orderId": "order-001",
    "expiredAt": "2024-01-26T13:00:00Z"
  }
}
```

## 이벤트 핸들러 예시

```typescript
async function handleWebhook(event: any) {
  const { event: eventType, data } = event;

  switch (eventType) {
    case 'payment.created':
      await updateOrderStatus(data.orderId, 'PENDING_PAYMENT');
      break;

    case 'payment.confirmed':
      await completeOrder(data.orderId);
      await sendNotification(data.payerAddress, '결제 완료');
      break;

    case 'payment.failed':
      await updateOrderStatus(data.orderId, 'PAYMENT_FAILED');
      break;

    case 'payment.expired':
      await cancelOrder(data.orderId);
      break;

    default:
      console.log('Unknown event:', eventType);
  }
}
```

## 다음 단계

- [API Reference](/ko/api/) - 전체 API 명세
- [에러 코드](/ko/api/errors) - 에러 처리
