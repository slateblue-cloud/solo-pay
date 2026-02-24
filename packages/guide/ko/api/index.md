# API Reference

SoloPay REST API 전체 명세입니다.

## Base URL

| 환경        | URL                                      |
| ----------- | ---------------------------------------- |
| Production  | `https://pay-api.msq.com/api/v1`         |
| Staging     | `https://pay-api.staging.msq.com/api/v1` |
| Development | `http://localhost:3001/api/v1`           |

## 인증

| 방식       | 헤더           | 사용 엔드포인트                                                                      |
| ---------- | -------------- | ------------------------------------------------------------------------------------ |
| Public Key | `x-public-key` | POST /payments, GET /payments/:id, POST /payments/:id/relay, GET /payments/:id/relay |
| API Key    | `x-api-key`    | GET /merchant/\*, POST /merchant/payment-methods, POST /refunds, GET /refunds        |
| 없음       | -              | GET /chains, GET /chains/tokens                                                      |

## 공통 응답 형식

### 성공

```json
{
  "success": true,
  ...
}
```

### 에러

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": [...]
}
```

---

## Payments

### POST /payments

결제를 생성합니다.

**인증**: `x-public-key` + `Origin` 헤더

**Request**

```json
{
  "orderId": "order-001",
  "amount": 10.5,
  "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  "successUrl": "https://example.com/success",
  "failUrl": "https://example.com/fail",
  "currency": "USD"
}
```

| 필드           | 타입    | 필수 | 설명                                                     |
| -------------- | ------- | ---- | -------------------------------------------------------- |
| `orderId`      | string  | ✓    | 가맹점 주문 ID (중복 불가)                               |
| `amount`       | number  | ✓    | 결제 금액 (토큰 단위 또는 법정화폐 단위)                 |
| `tokenAddress` | address | ✓    | ERC-20 토큰 주소 (화이트리스트 & 가맹점 활성화 필수)     |
| `successUrl`   | string  | ✓    | 결제 성공 시 리다이렉트 URL                              |
| `failUrl`      | string  | ✓    | 결제 실패 시 리다이렉트 URL                              |
| `currency`     | string  |      | 법정화폐 코드 (예: `USD`, `KRW`). 입력 시 가격 변환 적용 |

**Response (201)**

```json
{
  "success": true,
  "paymentId": "0xabc123def456...",
  "orderId": "order-001",
  "serverSignature": "0x...",
  "chainId": 80002,
  "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  "tokenSymbol": "SUT",
  "tokenDecimals": 18,
  "gatewayAddress": "0x...",
  "forwarderAddress": "0x...",
  "amount": "10500000000000000000",
  "recipientAddress": "0xMerchantWallet...",
  "merchantId": "0x...",
  "feeBps": 100,
  "successUrl": "https://example.com/success",
  "failUrl": "https://example.com/fail",
  "expiresAt": "2024-01-26T13:00:00.000Z"
}
```

---

### GET /payments/:id

결제 상태를 조회합니다.

**인증**: `x-public-key` 헤더 (GET 요청에서 Origin 대신 `x-origin` 헤더 사용 가능)

**Response (200)**

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

---

### POST /payments/:id/relay

Gasless 결제를 제출합니다.

**인증**: `x-public-key` + `Origin` 헤더

**Request**

```json
{
  "paymentId": "0xabc123...",
  "forwarderAddress": "0x...",
  "forwardRequest": {
    "from": "0x...",
    "to": "0x...",
    "value": "0",
    "gas": "200000",
    "nonce": "1",
    "deadline": "1706281200",
    "data": "0x...",
    "signature": "0x..."
  }
}
```

**Response (202)**

```json
{
  "success": true,
  "status": "submitted",
  "message": "Gasless 거래가 제출되었습니다"
}
```

---

### GET /payments/:id/relay

Relay 요청 상태를 조회합니다.

**인증**: `x-public-key` 헤더

**Response (200)**

```json
{
  "success": true,
  "data": {
    "status": "CONFIRMED",
    "transactionHash": "0xdef789...",
    "errorMessage": null,
    "createdAt": "2024-01-26T12:34:00Z",
    "updatedAt": "2024-01-26T12:35:42Z"
  }
}
```

| 상태        | 설명               |
| ----------- | ------------------ |
| `QUEUED`    | Relay 요청 대기 중 |
| `SUBMITTED` | 트랜잭션 제출됨    |
| `CONFIRMED` | 트랜잭션 확정 완료 |
| `FAILED`    | 트랜잭션 실패      |

---

## Merchant

### GET /merchant

현재 가맹점 정보를 조회합니다.

**인증**: `x-api-key`

**Response (200)**

```json
{
  "success": true,
  "merchant": {
    "id": 1,
    "merchant_key": "my-store",
    "name": "My Store",
    "chain_id": 80002,
    "chain": { "id": 1, "network_id": 80002, "name": "Polygon Amoy", "is_testnet": true },
    "webhook_url": null,
    "public_key": "pk_test_xxx",
    "is_enabled": true,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "payment_methods": [...]
  },
  "chainTokens": [...]
}
```

---

### GET /merchant/payment-methods

결제 수단 목록을 조회합니다.

**인증**: `x-api-key`

---

### POST /merchant/payment-methods

결제 수단을 추가합니다.

**인증**: `x-api-key`

```json
{
  "tokenAddress": "0x...",
  "is_enabled": true
}
```

---

### PATCH /merchant/payment-methods/:id

결제 수단을 수정합니다.

```json
{ "is_enabled": false }
```

---

### GET /merchant/payments

결제 내역을 조회합니다.

**인증**: `x-api-key`

**Query Parameters**: `orderId` (특정 주문 조회)

---

### GET /merchant/payments/:id

특정 결제 상세를 조회합니다.

**인증**: `x-api-key`

---

## Refunds

### POST /refunds

환불을 요청합니다.

**인증**: `x-api-key`

```json
{
  "paymentId": "0xabc123...",
  "reason": "고객 요청에 의한 환불"
}
```

**Response (201)**

```json
{
  "success": true,
  "data": {
    "refundId": "uuid-...",
    "paymentId": "0xabc123...",
    "amount": "10500000000000000000",
    "tokenAddress": "0x...",
    "payerAddress": "0x...",
    "status": "PENDING",
    "serverSignature": "0x...",
    "merchantId": "0x...",
    "createdAt": "2024-01-26T12:40:00Z"
  }
}
```

---

### GET /refunds/:refundId

환불 상태를 조회합니다.

**인증**: `x-api-key`

**상태**: `PENDING` → `SUBMITTED` → `CONFIRMED` (또는 `FAILED`)

---

### GET /refunds

환불 목록을 조회합니다.

**인증**: `x-api-key`

**Query Parameters**: `page`, `limit`, `status`, `paymentId`

---

## Chains

### GET /chains

지원 체인 목록을 조회합니다. (인증 없음)

```json
{
  "success": true,
  "chains": [
    { "id": 1, "network_id": 80002, "name": "Polygon Amoy", "is_testnet": true },
    { "id": 2, "network_id": 97, "name": "BSC Testnet", "is_testnet": true },
    { "id": 3, "network_id": 11155111, "name": "Sepolia", "is_testnet": true }
  ]
}
```

---

### GET /chains/tokens

지원 체인과 토큰 전체 목록을 조회합니다. (인증 없음)

---

## Health

### GET /health

서버 상태를 확인합니다. (인증 없음)

```json
{
  "status": "ok",
  "timestamp": "2024-01-26T12:00:00.000Z"
}
```

## 다음 단계

- [에러 코드](/ko/api/errors) - 에러 처리
