# Quick Start

Get SoloPay integrated in 5 minutes.

## Prerequisites

- API Key and Public Key (provided by admin)
- Node.js 18 or higher

## Step 1: Open Payment Widget

Open the payment widget with `@solo-pay/widget-js`. The widget handles payment creation, wallet connection, signing, and processing.

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

For React projects, using the [`useWidget` hook from `@solo-pay/widget-react`](/en/widget/) is recommended.

## Step 2: Verify Payment Result

As soon as the `paymentId` is received from the callback URL, verify the final status from the server.

```bash
curl https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

Only mark the order complete when `status === 'ESCROWED'` or `status === 'FINALIZED'` and `amount`, `tokenAddress`, and `orderId` all match.

If you use escrow, after payment is **ESCROWED** your backend can call **POST /payments/:id/finalize** to release funds to your wallet. See [Finalize & Cancel](/en/payments/finalize).

## Payment Status Flow

```
CREATED ──► ESCROWED ──► FINALIZE_SUBMITTED ──► FINALIZED
                    └──► CANCEL_SUBMITTED   ──► CANCELLED
CREATED ──► EXPIRED
CREATED ──► FAILED
```

| Status      | Description                   |
| ----------- | ----------------------------- |
| `CREATED`   | Payment created               |
| `ESCROWED`  | User paid; funds in escrow    |
| `FINALIZED` | Funds released to merchant    |
| `FAILED`    | Transaction failed            |
| `EXPIRED`   | Expired (30 minutes exceeded) |

## Next Steps

- [Finalize & Cancel](/en/payments/finalize) - Release or cancel escrowed payments
- [Authentication](/en/getting-started/authentication) - API Key / Public Key details
- [Client-Side Integration](/en/developer/client-side) - Step-by-step implementation guide
- [Create Payment API](/en/payments/create) - Detailed payment API guide
