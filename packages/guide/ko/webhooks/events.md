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

## payment.escrowed

결제가 에스크로된 상태입니다. 사용자가 결제를 완료했고 자금이 에스크로에 보관됩니다. 머천트는 확정(자금 해제) 또는 취소(구매자 환불)를 선택할 수 있습니다.

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

자금이 머천트로 해제되었습니다. 확정 플로우의 최종 성공 상태입니다.

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

에스크로 결제가 취소되어 자금이 구매자에게 환불되었습니다.

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

결제가 만료되었을 때 발생합니다. (30분 초과 시)

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

    case 'payment.escrowed':
      await updateOrderStatus(data.orderId, 'PAID_ESCROW');
      // 여기서 주문 완료 처리하거나 payment.finalized 대기
      break;

    case 'payment.finalized':
      await completeOrder(data.orderId);
      await sendNotification(data.payerAddress, '결제 완료');
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

    default:
      console.log('Unknown event:', eventType);
  }
}
```

## 다음 단계

- [결제 상태](/ko/payments/status) - 전체 상태 값
- [결제 확정 및 취소](/ko/payments/finalize) - 에스크로 후 확정/취소
- [API Reference](/ko/api/) - 전체 API 명세
- [에러 코드](/ko/api/errors) - 에러 처리
