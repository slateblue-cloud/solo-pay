# 결제 확정 및 취소 (Finalize & Cancel)

결제가 **ESCROWED** 상태가 되면, 머천트는 **확정(finalize)**(머천트 지갑으로 자금 해제) 또는 **취소(cancel)**(구매자에게 환불) 중 하나를 선택해야 합니다. 두 작업 모두 **머천트 서버**에서 API 키로 호출합니다.

## 호출 가능 주체

- **POST /payments/:id/finalize** — 해당 결제의 **머천트만** 호출 가능 (`x-api-key` 인증). **에스크로 기한** 내에 호출해야 하며, 기한이 지나면 API가 `ESCROW_EXPIRED`를 반환합니다.
- **POST /payments/:id/cancel** — 해당 결제의 **머천트만** 호출 가능 (`x-api-key` 인증). 결제가 ESCROWED인 동안 유효합니다. **에스크로 기한**이 지나면, 이 API 없이도 **온체인에서** 누구나 취소(컨트랙트 직접 호출)할 수 있으며, 이 API는 머천트가 기한 전 또는 기한 내에 취소할 때 사용합니다.

## 만료 vs 에스크로 기한

- **결제 EXPIRED** — 결제 생성 후 지정된 시간(예: 30분 초과) 안에 결제가 완료되지 않은 경우. 상태가 `EXPIRED`가 되며 에스크로는 발생하지 않습니다. 새 결제를 생성해 재시도하세요.
- **에스크로 기한** — 결제가 ESCROWED가 된 뒤, 머천트는 에스크로 기한까지 **확정(finalize)**(자금 해제)할 수 있습니다. 기한이 지나면 이 API로 finalize를 호출하면 `ESCROW_EXPIRED`가 반환되고, 컨트랙트에서는 **권한 없이 취소**(permissionless cancel)가 가능할 수 있어, 누구나 온체인에서 취소를 호출해 구매자에게 자금을 돌려줄 수 있습니다.

## 호출 시점

- **payment.escrowed** 웹훅을 받은 후, 또는
- **GET /payments/:id** 응답에서 `status: "ESCROWED"`인 경우

이후 **POST /payments/:id/finalize**로 자금을 본인 지갑으로 해제하거나, **POST /payments/:id/cancel**로 구매자에게 환불합니다.

## 확정 (Finalize, 머천트로 자금 해제)

**엔드포인트:** `POST /payments/:id/finalize`  
**인증:** `x-api-key` (API 키만 사용, public key 아님)

요청 본문 없음. 결제 ID는 URL 경로에 포함됩니다.

### 예시

```bash
curl -X POST https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-api-key: sk_test_xxxxx"
```

### 응답 (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "relayRequestId": "uuid-...",
    "transactionHash": null,
    "status": "submitted"
  }
}
```

응답의 `data.status`는 **릴레이 제출 상태**(`submitted` 또는 `pending`)이며 결제 상태가 아닙니다. 결제 상태는 DB에서 **FINALIZE_SUBMITTED**가 되고, 온체인 트랜잭션 확정 후 **FINALIZED**가 되며 **payment.finalized** 웹훅이 전달됩니다. **GET /payments/:id**로 폴링하여 `status === "FINALIZED"`가 될 때까지 확인하세요.

::: tip 에스크로 기한
확정(finalize)은 에스크로 기한 내에 호출해야 합니다. 기한이 지나면 API는 `ESCROW_EXPIRED`를 반환하고, 컨트랙트에서는 누구나 온체인에서 취소(권한 없이)할 수 있습니다.
:::

## 취소 (Cancel, 구매자에게 환불)

**엔드포인트:** `POST /payments/:id/cancel`  
**인증:** `x-api-key` (머천트만; 해당 결제 소유 머천트)

요청 본문 없음. finalize와 동일한 패턴입니다. 에스크로 기한이 지나면 이 API 없이도 누구나 온체인에서 취소할 수 있습니다.

### 응답 (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "relayRequestId": "uuid-...",
    "transactionHash": null,
    "status": "submitted"
  }
}
```

finalize와 마찬가지로 `data.status`는 릴레이 제출 상태입니다. 결제 상태는 **CANCEL_SUBMITTED**가 된 뒤 온체인 확정 시 **CANCELLED**가 되며 **payment.cancelled** 웹훅이 전달됩니다.

## 에러 코드

| HTTP | Code                                                                     | 의미                                    |
| ---- | ------------------------------------------------------------------------ | --------------------------------------- |
| 400  | INVALID_STATUS                                                           | 결제가 ESCROWED가 아님                  |
| 400  | ESCROW_EXPIRED                                                           | 에스크로 기한 경과 (finalize만 해당)    |
| 403  | FORBIDDEN                                                                | 해당 결제가 이 머천트 소유가 아님       |
| 404  | PAYMENT_NOT_FOUND                                                        | 결제를 찾을 수 없음                     |
| 409  | CONFLICT                                                                 | 동시 finalize/cancel 요청 (이미 제출됨) |
| 500  | CHAIN_CONFIG_ERROR, SIGNING_SERVICE_ERROR, RELAYER_ERROR, INTERNAL_ERROR | 서버 또는 체인 오류                     |

자세한 내용은 [에러 코드](/ko/api/errors)를 참조하세요.

## 다음 단계

- [결제 상태](/ko/payments/status) - 상태 값 및 흐름
- [웹훅 이벤트](/ko/webhooks/events) - payment.escrowed, payment.finalized, payment.cancelled
- [API Reference](/ko/api/) - 전체 엔드포인트 명세
