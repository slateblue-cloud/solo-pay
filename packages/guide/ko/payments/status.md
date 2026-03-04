# 결제 상태 조회

결제의 현재 상태를 조회합니다.

- 인증: `x-public-key` 헤더 필수
- GET 요청 시 Origin 헤더 대신 `x-origin` 헤더 사용 가능 (프록시 환경)

## REST API

```bash
curl https://pay-api.staging.sut.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

## 응답

### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "status": "ESCROWED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "payerAddress": "0x...",
    "treasuryAddress": "0xMerchantWallet...",
    "transactionHash": "0xdef789...",
    "releaseTxHash": null,
    "deadline": "1706281200",
    "escrowDuration": "300",
    "createdAt": "2024-01-26T12:30:00Z",
    "updatedAt": "2024-01-26T12:35:42Z",
    "payment_hash": "0xabc123...",
    "network_id": 80002,
    "token_symbol": "SUT"
  }
}
```

- **transactionHash** — 에스크로(결제) 트랜잭션 해시.
- **releaseTxHash** — 확정 또는 취소 트랜잭션 해시. 상태가 FINALIZE_SUBMITTED, FINALIZED, CANCEL_SUBMITTED, CANCELLED일 때 존재합니다.
- **escrowDuration** — 에스크로 유지 시간(초). API는 에스크로 기한의 정확한 일시(ISO)를 반환하지 않으며, 이 값으로 결제 에스크로 후 머천트가 확정할 수 있는 기간을 알 수 있습니다.

## 상태 흐름

```
CREATED ──► ESCROWED ──► FINALIZE_SUBMITTED ──► FINALIZED
                    └──► CANCEL_SUBMITTED   ──► CANCELLED ──► REFUND_SUBMITTED ──► REFUNDED

CREATED ──► EXPIRED
CREATED ──► FAILED
```

## 상태 설명

| 상태                 | 설명                              | 다음 액션                                                                |
| -------------------- | --------------------------------- | ------------------------------------------------------------------------ |
| `CREATED`            | 결제 생성됨, 온체인 트랜잭션 대기 | 사용자가 결제 진행                                                       |
| `ESCROWED`           | 결제 에스크로됨 (온체인)          | 머천트: [결제 확정 및 취소](/ko/payments/finalize) 호출로 자금 해제/환불 |
| `FINALIZE_SUBMITTED` | 확정 트랜잭션 제출됨              | FINALIZED 될 때까지 대기 (폴링 또는 웹훅)                                |
| `FINALIZED`          | 자금이 머천트로 해제됨            | 없음 (종료)                                                              |
| `CANCEL_SUBMITTED`   | 취소 트랜잭션 제출됨              | CANCELLED 될 때까지 대기                                                 |
| `CANCELLED`          | 자금이 구매자에게 환불됨          | 없음 (종료)                                                              |
| `REFUND_SUBMITTED`   | 환불 트랜잭션 제출됨              | REFUNDED 될 때까지 대기                                                  |
| `REFUNDED`           | 환불 완료                         | 없음 (종료)                                                              |
| `FAILED`             | 트랜잭션 실패                     | 새 결제 생성                                                             |
| `EXPIRED`            | 만료 (30분 초과)                  | 새 결제 생성                                                             |

::: tip 온체인 동기화
GET /payments/:id 호출 시 블록체인과 DB 상태를 실시간으로 동기화합니다. 결제 성공 시 상태는 **ESCROWED**(사용자 결제 완료, 에스크로) 또는 **FINALIZED**(자금 머천트 해제)입니다.
:::

## 다음 단계

- [결제 확정 및 취소](/ko/payments/finalize) - 에스크로 결제 확정/취소
- [결제 동작 원리](/ko/developer/how-it-works) - 가스리스 아키텍처
- [에러 코드](/ko/api/errors) - 에러 처리
