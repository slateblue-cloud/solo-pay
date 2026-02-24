# 결제 상태 조회

결제의 현재 상태를 조회합니다.

- 인증: `x-public-key` 헤더 필수
- GET 요청 시 Origin 헤더 대신 `x-origin` 헤더 사용 가능 (프록시 환경)

## REST API

```bash
curl https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

## 응답

### 성공 (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "status": "CONFIRMED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "payerAddress": "0x...",
    "treasuryAddress": "0xMerchantWallet...",
    "transactionHash": "0xdef789...",
    "blockNumber": 12345678,
    "createdAt": "2024-01-26T12:30:00Z",
    "updatedAt": "2024-01-26T12:35:42Z",
    "payment_hash": "0xabc123...",
    "network_id": 80002,
    "token_symbol": "SUT"
  }
}
```

## 상태 흐름

```
CREATED ──────────▶ PENDING ──────────▶ CONFIRMED
    │                  │
    │                  │
    ▼                  ▼
 EXPIRED            FAILED
```

## 상태 설명

| 상태        | 설명                            | 다음 액션          |
| ----------- | ------------------------------- | ------------------ |
| `CREATED`   | 결제 생성됨, 사용자 액션 대기   | 사용자가 결제 진행 |
| `PENDING`   | 트랜잭션 전송됨, 블록 확정 대기 | 대기 (보통 수 초)  |
| `CONFIRMED` | 결제 완료, 블록 확정됨          | 완료 처리          |
| `FAILED`    | 트랜잭션 실패                   | 새 결제 생성       |
| `EXPIRED`   | 30분 초과로 만료                | 새 결제 생성       |

::: tip 온체인 동기화
GET /payments/:id 호출 시 블록체인 상태와 DB 상태를 실시간으로 동기화합니다. 온체인에서 결제 완료가 확인되면 상태가 자동으로 `CONFIRMED`로 업데이트됩니다.
:::

## 다음 단계

- [결제 동작 원리](/ko/developer/how-it-works) - 가스리스 아키텍처
- [에러 코드](/ko/api/errors) - 에러 처리
