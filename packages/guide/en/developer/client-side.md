# Client-Side Integration Guide

Integration guide for redirecting users to the SoloPay payment UI.

## Full Flow

```
1. [Merchant Frontend] Call widget (pass orderId, amount, tokenAddress)
        ↓
2. [SoloPay Widget] Create payment + connect wallet + process payment
        ↓
3. [SoloPay] After payment, redirect to successUrl or failUrl
        ↓
4. [Merchant Frontend] Cross-verify payment result via API (required)
```

The widget handles everything from payment creation to wallet connection, signing, and processing. Merchants only need to **call the widget and verify the result**.

## Step 1: Open Payment Widget

Use the `@solo-pay/widget-js` SDK to open the payment widget. For React projects, using the [`useWidget` hook from `@solo-pay/widget-react`](/en/widget/) is recommended.

```bash
npm install @solo-pay/widget-js
```

```typescript
import { SoloPay } from '@solo-pay/widget-js';

const solopay = new SoloPay({
  publicKey: 'pk_test_xxxxx', // Your issued Public Key
});

solopay.requestPayment({
  orderId: 'order-001', // Merchant order ID
  amount: '10.5', // Payment amount
  tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
  successUrl: 'https://yourshop.com/payment/success',
  failUrl: 'https://yourshop.com/payment/fail',
});
```

## Step 2: Handle Callback URL

After payment, SoloPay redirects the user to the `successUrl` or `failUrl` specified at payment creation.

```
https://yourshop.com/payment/success?paymentId=0xabc123...
https://yourshop.com/payment/fail?paymentId=0xabc123...&reason=expired
```

::: warning Do Not Trust URL Parameters
URL parameters can be manipulated by the user. Always **verify payment status via API** as the final check.
:::

## Step 3: Cross-Verify Payment Result (Required)

As soon as the `paymentId` is received from the callback URL, call the status API to verify payment. The `GET /payments/:id` endpoint uses the `x-public-key` header, which can be called from the browser.

```typescript
const response = await fetch(`https://pay-api.staging.msq.com/api/v1/payments/0xabc123...`, {
  headers: { 'x-public-key': 'pk_test_xxxxx' },
});
const result = await response.json();
```

**Verification Checklist**

- [ ] Confirm `status === 'CONFIRMED'`
- [ ] Confirm `amount` matches order amount
- [ ] Confirm `tokenAddress` matches the expected token
- [ ] Confirm `orderId` matches the expected orderId
- [ ] Prevent duplicate completion processing for the same `paymentId`

## Webhook Integration (Recommended)

The callback URL approach can fail if the user closes the browser. **Using it with Webhooks** allows reliable payment completion reception even when the user does not return to the success page.

- [View Webhook Setup Guide](/en/webhooks/)

## Next Steps

- [Webhook Setup](/en/webhooks/) — Reliable payment status reception
