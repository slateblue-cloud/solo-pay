# 위젯(Widget) 연동 가이드

SoloPay 결제 위젯을 사용하면 결제 UI를 직접 개발하지 않고도 결제를 연동할 수 있습니다. SDK가 지갑 연결, 서명, 결제 처리를 모두 담당합니다.

프레임워크에 따라 적합한 패키지를 선택하세요.

## React 프로젝트

`@solo-pay/widget-react` 패키지는 React 훅 방식으로 위젯을 연동합니다.

### 설치

```bash
npm install @solo-pay/widget-react
```

### 사용법

```typescript
import { useWidget } from '@solo-pay/widget-react';

function CheckoutButton({ orderId, amount }) {
  const { openWidget } = useWidget({
    clientId: 'pk_test_xxxxx', // 발급받은 Public Key
    defaultPaymentRequest: {
      tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
      successUrl: 'https://myshop.com/payment/success',
      failUrl: 'https://myshop.com/payment/fail',
      currency: 'USD',
    },
    onClose: () => console.log('위젯이 닫혔습니다.'),
    onError: (err) => console.error('결제 오류:', err),
  });

  return (
    <button onClick={() => openWidget({ orderId, amount: String(amount) })}>
      결제하기
    </button>
  );
}
```

`useWidget`은 컴포넌트 마운트 시 SDK 인스턴스를 초기화하고, 언마운트 시 자동으로 정리합니다.

## Vanilla JS / 기타 프레임워크

`@solo-pay/widget-js` 패키지는 프레임워크 없이 사용할 수 있습니다.

### 설치

```bash
npm install @solo-pay/widget-js
```

### 사용법

```typescript
import { SoloPay } from '@solo-pay/widget-js';

const solopay = new SoloPay({
  publicKey: 'pk_test_xxxxx',
  // widgetUrl: 'https://widget.solo-pay.com', // 기본값 사용 시 생략 가능
});

solopay.requestPayment(
  {
    orderId: 'order-2024-00001',
    amount: '25.5',
    tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    successUrl: 'https://myshop.com/payment/success',
    failUrl: 'https://myshop.com/payment/fail',
    currency: 'USD',
  },
  {
    onClose: () => {
      // 사용자가 위젯을 닫았을 때 처리
    },
  }
);
```

## 동작 방식

- **PC 환경**: 팝업 창으로 위젯이 열립니다.
- **모바일 환경**: 전체 화면 페이지로 리다이렉트됩니다.
- 결제 완료 또는 실패 시 `successUrl` 또는 `failUrl`로 자동 리다이렉트합니다.

## 결제 완료 처리

결제 완료 후 `successUrl`로 리다이렉트 시 URL에 `paymentId`가 포함됩니다.

```
https://myshop.com/payment/success?paymentId=0xabc123...
```

::: warning URL 파라미터 신뢰 금지
URL 파라미터는 사용자가 조작할 수 있습니다. 반드시 상태 조회 API를 통해 최종 결제 상태를 검증하세요.
:::

`GET /api/v1/payments/:paymentId` API를 `x-public-key` 헤더와 함께 호출하여 상태가 **ESCROWED** 또는 **FINALIZED**인지, 금액과 orderId가 일치하는지 확인한 후 주문을 완료 처리합니다. 이 엔드포인트는 브라우저에서 직접 호출할 수 있습니다.

## 다음 단계

- [클라이언트 사이드 연동 가이드](/ko/developer/client-side) — 결제 결과 검증 방법
- [Webhook 설정](/ko/webhooks/) — 안정적인 결제 완료 수신
