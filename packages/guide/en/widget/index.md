# Widget Integration Guide

With the SoloPay payment widget, you can integrate payments without building a custom payment UI. The SDK handles wallet connection, signing, and payment processing.

Choose the package that fits your framework.

## React Projects

The `@solo-pay/widget-react` package integrates the widget using a React hook.

### Installation

```bash
npm install @solo-pay/widget-react
```

### Usage

```typescript
import { useWidget } from '@solo-pay/widget-react';

function CheckoutButton({ orderId, amount }) {
  const { openWidget } = useWidget({
    clientId: 'pk_test_xxxxx', // Your issued Public Key
    defaultPaymentRequest: {
      tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
      successUrl: 'https://myshop.com/payment/success',
      failUrl: 'https://myshop.com/payment/fail',
      currency: 'USD',
    },
    onClose: () => console.log('Widget closed.'),
    onError: (err) => console.error('Payment error:', err),
  });

  return (
    <button onClick={() => openWidget({ orderId, amount: String(amount) })}>
      Pay Now
    </button>
  );
}
```

`useWidget` initializes the SDK instance on mount and automatically cleans up on unmount.

## Vanilla JS / Other Frameworks

The `@solo-pay/widget-js` package works without any framework.

### Installation

```bash
npm install @solo-pay/widget-js
```

### Usage

```typescript
import { SoloPay } from '@solo-pay/widget-js';

const solopay = new SoloPay({
  publicKey: 'pk_test_xxxxx',
  // widgetUrl: 'https://widget.solo-pay.com', // Optional, defaults to this value
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
      // Handle user closing the widget
    },
  }
);
```

## How It Works

- **Desktop**: The widget opens as a popup window.
- **Mobile**: The user is redirected to a full-screen page.
- After payment completion or failure, the widget auto-redirects to `successUrl` or `failUrl`.

## Handling Payment Completion

When the widget redirects to `successUrl`, it includes a `paymentId` in the URL.

```
https://myshop.com/payment/success?paymentId=0xabc123...
```

::: warning Do Not Trust URL Parameters
URL parameters can be manipulated by the user. Always verify the final payment status by calling the status API.
:::

Call `GET /api/v1/payments/:paymentId` with the `x-public-key` header to confirm status is **ESCROWED** or **FINALIZED** and verify the amount and orderId before fulfilling the order. This endpoint can be called directly from the browser.

## Next Steps

- [Client-Side Integration Guide](/en/developer/client-side) — How to verify payment results
- [Webhook Setup](/en/webhooks/) — Reliable payment completion notifications
