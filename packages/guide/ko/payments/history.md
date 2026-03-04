# 결제 내역 조회

가맹점의 결제 내역을 조회합니다. API Key 인증이 필요합니다.

## REST API

```bash
# orderId로 조회
curl "https://pay-api.staging.msq.com/api/v1/merchant/payments?orderId=order-001" \
  -H "x-api-key: sk_xxxxx"

# paymentId로 조회
curl "https://pay-api.staging.msq.com/api/v1/merchant/payments/0xabc123..." \
  -H "x-api-key: sk_xxxxx"
```

## 응답

```json
{
  "paymentId": "0xabc123...",
  "orderId": "order-001",
  "status": "FINALIZED",
  "amount": "10500000000000000000",
  "tokenSymbol": "SUT",
  "tokenDecimals": 18,
  "txHash": "0xdef789...",
  "payerAddress": "0x1234...",
  "createdAt": "2024-01-26T12:30:00Z",
  "confirmedAt": "2024-01-26T12:35:42Z",
  "expiresAt": "2024-01-26T13:00:00Z"
}
```

## 응답 필드

| 필드            | 타입     | 설명                                                                                                                       |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `paymentId`     | `string` | 결제 고유 식별자 (bytes32 해시)                                                                                            |
| `orderId`       | `string` | 가맹점 주문 ID                                                                                                             |
| `status`        | `string` | CREATED, ESCROWED, FINALIZE_SUBMITTED, FINALIZED, CANCEL_SUBMITTED, CANCELLED, REFUND_SUBMITTED, REFUNDED, EXPIRED, FAILED |
| `amount`        | `string` | wei 단위 금액                                                                                                              |
| `tokenSymbol`   | `string` | 토큰 심볼                                                                                                                  |
| `tokenDecimals` | `number` | 토큰 소수점                                                                                                                |
| `txHash`        | `string` | 온체인 트랜잭션 해시 (확정 후 존재)                                                                                        |
| `payerAddress`  | `string` | 결제자 지갑 주소 (확정 후 존재)                                                                                            |
| `confirmedAt`   | `string` | 결제 확정 시각                                                                                                             |
| `expiresAt`     | `string` | 결제 만료 시각                                                                                                             |

## Subgraph를 통한 온체인 조회

Subgraph를 통해 온체인 결제 이벤트를 직접 조회할 수도 있습니다.

```graphql
query PaymentHistory($payer: Bytes!) {
  paymentReceivedEvents(
    where: { payer: $payer }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 10
  ) {
    id
    paymentId
    payer
    token
    amount
    transactionHash
    blockTimestamp
  }
}
```

::: tip Subgraph 사용
대량의 히스토리 조회나 복잡한 필터링이 필요한 경우 Subgraph를 사용하세요.
:::

## 다음 단계

- [환불](/ko/payments/refunds) - 결제 환불 처리
- [에러 코드](/ko/api/errors) - 에러 처리
