# SoloPay 클라이언트 SDK

SoloPay는 결제 위젯을 손쉽게 연동할 수 있는 클라이언트 사이드 SDK를 제공합니다.

## 패키지 선택

- `@solo-pay/widget-js` — 프레임워크 독립 (Vanilla JS), 모든 환경에서 사용 가능
- `@solo-pay/widget-react` — React 훅 래퍼, React 프로젝트에서 사용

## widget-js 설치 및 사용

```bash
npm install @solo-pay/widget-js
```

```typescript
import { SoloPay } from '@solo-pay/widget-js';

const solopay = new SoloPay({
  publicKey: 'pk_test_xxxxx', // 발급받은 Public Key
});

solopay.requestPayment({
  orderId: 'order-001',
  amount: '10.5',
  tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
  successUrl: 'https://yourshop.com/payment/success',
  failUrl: 'https://yourshop.com/payment/fail',
});
```

## widget-react 설치 및 사용

```bash
npm install @solo-pay/widget-react
```

```typescript
import { useWidget } from '@solo-pay/widget-react';

const { openWidget } = useWidget({
  clientId: 'pk_test_xxxxx',
  defaultPaymentRequest: {
    tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    successUrl: 'https://yourshop.com/payment/success',
    failUrl: 'https://yourshop.com/payment/fail',
  },
});

openWidget({ orderId: 'order-001', amount: '10.5' });
```

## 다음 단계

- [위젯 연동 가이드](/ko/widget/) - 전체 사용 가이드
- [클라이언트 사이드 연동](/ko/developer/client-side) - 결제 결과 처리 방법
