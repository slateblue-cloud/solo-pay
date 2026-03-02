# 빠른 시작

5분 안에 SoloPay를 연동하는 방법을 알아봅니다.

## 사전 준비

- API Key 및 Public Key (관리자로부터 발급)
- Node.js 18 이상

## Step 1: 결제 위젯 열기

`@solo-pay/widget-js`로 결제 위젯을 엽니다. 위젯이 결제 생성, 지갑 연결, 서명, 결제 처리를 모두 담당합니다.

```bash
npm install @solo-pay/widget-js
```

```typescript
import { SoloPay } from '@solo-pay/widget-js';

const solopay = new SoloPay({
  publicKey: 'pk_test_xxxxx',
});

solopay.requestPayment({
  orderId: 'order-001',
  amount: '10.5',
  tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
  successUrl: 'https://yourshop.com/payment/success',
  failUrl: 'https://yourshop.com/payment/fail',
});
```

React 프로젝트라면 [`@solo-pay/widget-react`의 `useWidget` 훅](/ko/widget/)을 사용하는 것을 권장합니다.

## Step 2: 결제 결과 검증

Callback URL에서 `paymentId`를 받은 즉시 서버에서 최종 상태를 확인합니다.

```bash
curl https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

`status === 'ESCROWED'` 또는 `status === 'FINALIZED'`이고 `amount`, `tokenAddress`, `orderId`가 일치할 때만 주문을 완료 처리합니다.

에스크로를 사용하는 경우, 결제가 **ESCROWED**가 된 후 백엔드에서 **POST /payments/:id/finalize**를 호출하여 자금을 본인 지갑으로 해제할 수 있습니다. [결제 확정 및 취소](/ko/payments/finalize)를 참조하세요.

## 결제 상태 흐름

```
CREATED ──► ESCROWED ──► FINALIZE_SUBMITTED ──► FINALIZED
                    └──► CANCEL_SUBMITTED   ──► CANCELLED
CREATED ──► EXPIRED
CREATED ──► FAILED
```

| 상태        | 설명                       |
| ----------- | -------------------------- |
| `CREATED`   | 결제 생성됨                |
| `ESCROWED`  | 사용자 결제 완료, 에스크로 |
| `FINALIZED` | 자금 머천트로 해제됨       |
| `FAILED`    | 트랜잭션 실패              |
| `EXPIRED`   | 만료 (30분 초과)           |

## 다음 단계

- [결제 확정 및 취소](/ko/payments/finalize) - 에스크로 결제 확정/취소
- [인증](/ko/getting-started/authentication) - API Key / Public Key 상세 사용법
- [클라이언트 사이드 연동](/ko/developer/client-side) - 단계별 구현 가이드
- [결제 생성 API](/ko/payments/create) - 결제 API 상세 가이드
