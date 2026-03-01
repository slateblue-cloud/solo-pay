# 결제 생성

결제를 생성하고 고유 ID를 발급받습니다.

## 개요

SoloPay 위젯을 사용하면 **결제 생성은 위젯이 자동으로 처리**합니다. 이 페이지는 내부 동작을 이해하거나 커스텀 구현을 위한 참고용 API 명세입니다.

생성된 결제는 **30분 후 자동 만료**됩니다.

- 인증: `x-public-key` 헤더 필수 (pk_live_xxx 또는 pk_test_xxx)
- 체인 및 수령 주소는 가맹점 설정에서 자동 결정
- `tokenAddress`는 화이트리스트 등록 및 가맹점 활성화가 필수

## 결제 플로우

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  SoloPay 위젯│         │  SoloPay API │         │   블록체인   │
└──────┬──────┘         └──────┬──────┘         └──────┬──────┘
       │                       │                       │
       │  POST /payments       │                       │
       │──────────────────────▶│                       │
       │                       │                       │
       │  { paymentId, serverSignature, ... }          │
       │◀──────────────────────│                       │
       │                       │                       │
       │     (사용자가 지갑에서 결제)                   │
       │                       │                       │
       │                       │    TX 전송            │
       │                       │──────────────────────▶│
```

## REST API

```bash
curl -X POST https://pay-api.staging.msq.com/api/v1/payments \
  -H "x-public-key: pk_test_xxxxx" \
  -H "Origin: https://yourshop.com" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-001",
    "amount": 10.5,
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "successUrl": "https://example.com/success",
    "failUrl": "https://example.com/fail"
  }'
```

## 요청 파라미터

| 필드           | 타입      | 필수 | 설명                                                          |
| -------------- | --------- | ---- | ------------------------------------------------------------- |
| `orderId`      | `string`  | ✓    | 가맹점 주문 식별자 (같은 가맹점 내 중복 불가)                 |
| `amount`       | `number`  | ✓    | 결제 금액 (토큰 단위 또는 법정화폐 단위)                      |
| `tokenAddress` | `address` | ✓    | ERC-20 토큰 컨트랙트 주소 (화이트리스트 & 가맹점 활성화 필수) |
| `successUrl`   | `string`  | ✓    | 결제 성공 시 리다이렉트 URL                                   |
| `failUrl`      | `string`  | ✓    | 결제 실패 시 리다이렉트 URL                                   |
| `currency`     | `string`  |      | 법정화폐 코드 (예: `USD`, `KRW`). 입력 시 가격 변환 적용      |

::: tip currency 옵션
`currency`를 입력하면 `amount`는 법정화폐 기준으로 해석됩니다. 서버가 토큰 가격을 조회하여 토큰 단위로 변환합니다.
예: `amount: 10, currency: "USD"` → USD 10에 해당하는 토큰 수량으로 결제
:::

## 응답

### 성공 (201 Created)

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

### 에러 응답

| HTTP | 코드                       | 원인                              |
| ---- | -------------------------- | --------------------------------- |
| 400  | `TOKEN_NOT_ENABLED`        | 해당 토큰이 가맹점에서 비활성화됨 |
| 400  | `TOKEN_NOT_FOUND`          | 화이트리스트에 없는 토큰          |
| 400  | `UNSUPPORTED_CHAIN`        | 지원하지 않는 체인                |
| 400  | `CHAIN_NOT_CONFIGURED`     | 가맹점에 체인이 설정되지 않음     |
| 400  | `RECIPIENT_NOT_CONFIGURED` | 가맹점 수령 주소 미설정           |
| 400  | `VALIDATION_ERROR`         | 입력값 검증 실패                  |
| 409  | `DUPLICATE_ORDER`          | 이미 사용된 orderId               |

## 응답 필드 설명

| 필드               | 타입       | 설명                                |
| ------------------ | ---------- | ----------------------------------- |
| `paymentId`        | `string`   | 결제 고유 식별자 (bytes32 해시)     |
| `serverSignature`  | `string`   | 서버 EIP-712 서명 (컨트랙트 인증용) |
| `amount`           | `string`   | wei 단위로 변환된 금액              |
| `gatewayAddress`   | `address`  | PaymentGateway 컨트랙트 주소        |
| `forwarderAddress` | `address`  | ERC2771 Forwarder 주소 (Gasless용)  |
| `merchantId`       | `string`   | bytes32 형태의 가맹점 ID            |
| `feeBps`           | `number`   | 수수료 (basis points, 100 = 1%)     |
| `expiresAt`        | `datetime` | 결제 만료 시각 (생성 후 30분)       |

## 위젯 사용 시

위젯(`@solo-pay/widget-js` / `@solo-pay/widget-react`)을 사용하면 이 API를 직접 호출할 필요 없이 위젯이 자동으로 처리합니다.

[클라이언트 사이드 연동 가이드](/ko/developer/client-side) 참고

## 다음 단계

- [결제 상태 조회](/ko/payments/status) - 결제 진행 상황 확인
- [결제 동작 원리](/ko/developer/how-it-works) - 가스리스 아키텍처
