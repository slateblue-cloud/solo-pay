# 환불 (Refunds)

환불은 이미 **finalized**(확정)된 결제, 즉 자금이 가맹점에게 해제된 이후 구매자에게 금액을 돌려줄 때 사용합니다. 완료된 결제에 대한 환불은 Refunds API를 사용하세요.

::: info 환불(Refund) vs 취소(Cancel)

- **취소(Cancel)** — 결제가 아직 **ESCROWED**(에스크로) 상태일 때 사용. **POST /payments/:id/cancel** 호출로 확정 전 구매자에게 자금 반환. [결제 확정 및 취소](/ko/payments/finalize) 참조.
- **환불(Refund)** — 결제가 이미 **FINALIZED**(확정)된 경우 사용. **POST /refunds** 호출로 구매자에게 환불. 이 페이지는 환불(Refund) 흐름을 설명합니다.
  :::

## 사용 시점

- 결제 상태가 **FINALIZED**이며, 가맹점이 이미 자금을 수령한 경우.
- 구매자에게 전액 또는 일부를 반환해야 할 때 (예: 고객 요청, 주문 취소).

## 흐름

1. 결제가 **FINALIZED** 상태 (자금 가맹점 지갑).
2. 가맹점 서버에서 **POST /refunds** 호출 (`paymentId`, 선택 사항 `reason`). 인증: `x-api-key`.
3. 환불 상태: **PENDING** → **SUBMITTED** → **CONFIRMED** (또는 **FAILED**).
4. **GET /refunds/:refundId** 또는 **GET /refunds**로 상태 조회.

결제 상태는 온체인 환불이 확정되면 **REFUND_SUBMITTED** → **REFUNDED**로 표시됩니다.

## API 요약

| 동작           | 엔드포인트                 | 인증        |
| -------------- | -------------------------- | ----------- |
| 환불 요청      | **POST /refunds**          | `x-api-key` |
| 환불 상태 조회 | **GET /refunds/:refundId** | `x-api-key` |
| 환불 목록 조회 | **GET /refunds**           | `x-api-key` |

**POST /refunds** 요청 본문: `{ "paymentId": "0x...", "reason": "고객 요청" }` (reason 선택).

## 전체 API 명세

요청/응답 스키마, 상태 값, 에러 코드는 [API 전체 명세의 환불 섹션](/ko/api/#refunds)을 참조하세요.

## 다음 단계

- [결제 확정 및 취소](/ko/payments/finalize) — 에스크로 결제 해제 또는 취소 (확정 전)
- [결제 상태](/ko/payments/status) — REFUND_SUBMITTED, REFUNDED 포함 상태 값
- [에러 코드](/ko/api/errors) — API 에러 처리
