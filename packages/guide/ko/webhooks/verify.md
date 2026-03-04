# 결제 결과 검증

Webhook으로 수신한 이벤트의 결제 정보를 검증하는 방법입니다.

## 검증 방법

Webhook payload에 포함된 `paymentId`를 이용하여 서버에서 SoloPay API를 직접 호출해 결제 상태를 확인합니다.

::: warning 반드시 서버에서 검증하세요
Webhook payload의 내용을 그대로 신뢰하지 마세요. 반드시 API를 통해 실제 결제 상태를 재확인해야 합니다.
:::

```bash
curl https://pay-api.staging.sut.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

**검증 체크리스트**

- [ ] `status === 'ESCROWED'` 또는 `status === 'FINALIZED'` 확인 (결제 성공)
- [ ] `amount`가 주문 금액과 일치 확인
- [ ] `orderId`가 DB에 저장된 orderId와 일치 확인
- [ ] 동일 `paymentId`의 중복 처리 방지

## 멱등성 처리

같은 이벤트가 여러 번 전송될 수 있습니다. `paymentId`를 기준으로 중복 처리를 방지하세요.

```typescript
// 이미 처리된 paymentId인지 확인 (DB 조회)
const alreadyProcessed = await db.orders.isPaymentProcessed(data.paymentId);
if (alreadyProcessed) {
  return res.status(200).json({ received: true }); // 중복 이벤트 무시
}
```

## 다음 단계

- [이벤트 상세](/ko/webhooks/events) - 이벤트별 처리 방법
- [API Reference](/ko/api/) - 전체 API 명세
