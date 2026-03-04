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
    publicKey: 'pk_test_xxxxx',
    onError: (error) => console.error('Popup or server error:', error),
    onClose: () => console.log('User closed the popup.'),
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
      <h1>Checkout</h1>
      <button onClick={handleCheckout}>Pay with Solo Pay</button>
    </div>
  );
}
```

Success is handled by redirect to `successUrl` (and failure to `failUrl`). Handle confirmation on that page or via your server/webhook—there is no client-side success callback.

## API

- **`useWidget(config)`**
  - `config.publicKey` – Merchant public key (required).
  - `config.onError` – Called on error.
  - `config.onClose` – Called when the user closes the popup.
  - `config.defaultPaymentRequest` – Optional `tokenAddress`, `successUrl`, `failUrl`, `currency` so you can call `openWidget({ orderId, amount })` only.

- **Returns**
  - `openWidget(data)` – Open the payment popup. `data` must include `orderId` and `amount`; other fields can come from `defaultPaymentRequest` or be passed per call.
  - `closeWidget()` – Close the popup (PC only).

The hook creates one widget instance on mount and calls `destroy()` on unmount to avoid leaks and orphaned popups.
