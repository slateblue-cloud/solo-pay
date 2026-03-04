# SoloPay Client SDK

SoloPay provides client-side SDKs to easily integrate the payment widget.

## Package choice

- `@solo-pay/widget-js` — Framework-agnostic (Vanilla JS), works in any environment
- `@solo-pay/widget-react` — React hook wrapper for React projects

## widget-js install and usage

```bash
npm install @solo-pay/widget-js
```

```typescript
import { SoloPay } from '@solo-pay/widget-js';

const solopay = new SoloPay({
  publicKey: 'pk_test_xxxxx', // Your issued Public Key
});

solopay.requestPayment({
  orderId: 'order-001',
  amount: '10.5',
  tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
  successUrl: 'https://yourshop.com/payment/success',
  failUrl: 'https://yourshop.com/payment/fail',
});
```

## widget-react install and usage

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

## Next steps

- [Widget Integration Guide](/en/widget/) - Full usage guide
- [Client-Side Integration](/en/developer/client-side) - How to handle payment results
