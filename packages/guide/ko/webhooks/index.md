# Webhook

결제 상태 변경 시 실시간으로 알림을 받습니다.

## Webhook 개요

Webhook을 설정하면 결제 상태가 변경될 때 지정한 URL로 HTTP POST 요청을 받을 수 있습니다.

::: tip 왜 Webhook을 사용해야 하나요?

- **실시간 알림**: 상태 변경 즉시 알림
- **서버 리소스 절약**: 폴링 불필요
- **신뢰성**: 재시도 메커니즘 내장
  :::

## 이벤트 타입

| 이벤트              | 설명            | 발생 시점                  |
| ------------------- | --------------- | -------------------------- |
| `payment.created`   | 결제 생성됨     | 결제 생성 직후             |
| `payment.escrowed`  | 결제 에스크로됨 | 사용자 결제 완료, 에스크로 |
| `payment.finalized` | 결제 확정됨     | 자금 머천트로 해제         |
| `payment.cancelled` | 결제 취소됨     | 자금 구매자에게 환불       |
| `payment.failed`    | 결제 실패       | TX 실패 시                 |
| `payment.expired`   | 결제 만료       | 30분 초과 시               |

결제 완료는 **payment.escrowed**(사용자 결제 완료, 에스크로) 및/또는 **payment.finalized**(자금 머천트 지갑으로 해제) 수신 시로 판단합니다. 주문 완료는 정책에 따라 ESCROWED 또는 FINALIZED 시점에 처리하면 됩니다.

## Payload 구조

```json
{
  "event": "payment.finalized",
  "timestamp": "2024-01-26T12:35:42Z",
  "data": {
    "paymentId": "0xabc123...",
    "status": "FINALIZED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "payerAddress": "0x1234567890abcdef...",
    "txHash": "0xdef789...",
    "orderId": "order-001",
    "finalizedAt": "2024-01-26T12:35:42Z"
  }
}
```

## 헤더

| 헤더           | 설명               |
| -------------- | ------------------ |
| `Content-Type` | `application/json` |

## 가맹점 Webhook URL 설정

현재 가맹점 데이터 모델에 `webhook_url` 필드가 존재합니다. 관리자에게 문의하여 설정하세요.

## 다음 단계

- [이벤트 상세](/ko/webhooks/events) - payment.escrowed, payment.finalized, payment.cancelled
- [결제 상태 조회](/ko/payments/status) - 폴링 방식으로 상태 확인
- [에러 코드](/ko/api/errors) - 에러 처리
