# @solo-pay/widget-react

React hook wrapper for the SoloPay payment widget. Uses the vanilla [@solo-pay/widget-js](https://github.com/globalmsq/solo-pay) core under the hood.

## Install

```bash
pnpm add @solo-pay/widget-react react
```

(`@solo-pay/widget-js` is included as a dependency.)

## Usage

```tsx
import { useWidget } from '@solo-pay/widget-react';

export default function CheckoutPage() {
  const { openWidget } = useWidget({
    clientId: 'test_client_key_123',
    onSuccess: (response) => console.log('서버 처리 성공:', response),
    onError: (error) => console.error('팝업 또는 서버 에러:', error),
    onClose: () => console.log('사용자가 팝업을 닫았습니다.'),
    // Optional: set defaults so you can call openWidget({ orderId, amount }) only
    defaultPaymentRequest: {
      tokenAddress: '0x...',
      successUrl: 'https://yoursite.com/success',
      failUrl: 'https://yoursite.com/fail',
    },
  });

  const handleCheckout = () => {
    openWidget({
      orderId: 'ORDER_20260223_001',
      amount: 50000,
    });
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>주문 결제</h1>
      <button onClick={handleCheckout}>Solo Pay로 결제하기</button>
    </div>
  );
}
```

## API

- **`useWidget(config)`**
  - `config.clientId` – Merchant public key (required).
  - `config.onSuccess` – Called when payment succeeds.
  - `config.onError` – Called on error.
  - `config.onClose` – Called when the user closes the popup.
  - `config.defaultPaymentRequest` – Optional `tokenAddress`, `successUrl`, `failUrl`, `currency` so you can call `openWidget({ orderId, amount })` only.

- **Returns**
  - `openWidget(data)` – Open the payment popup. `data` must include `orderId` and `amount`; other fields can come from `defaultPaymentRequest` or be passed per call.
  - `closeWidget()` – Close the popup (PC only).

The hook creates one widget instance on mount and calls `destroy()` on unmount to avoid leaks and orphaned popups.
