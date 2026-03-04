# Refunds

Refunds are for payments that are already **finalized** (funds have been released to the merchant). To return funds to the buyer after a completed payment, use the Refunds API.

::: info Refund vs Cancel

- **Cancel** — Use when the payment is still **ESCROWED**. Call **POST /payments/:id/cancel** to return funds to the buyer before finalizing. See [Finalize & Cancel](/en/payments/finalize).
- **Refund** — Use when the payment is already **FINALIZED**. Call **POST /refunds** to refund the buyer. This page describes the Refund flow.
  :::

## When to use

- The payment status is **FINALIZED** (merchant has received the funds).
- You need to return the full or partial amount to the buyer (e.g. customer request, order cancellation after fulfillment).

## Flow

1. Payment is **FINALIZED** (funds with merchant).
2. Merchant server calls **POST /refunds** with `paymentId` and optional `reason`. Auth: `x-api-key`.
3. Refund status moves: **PENDING** → **SUBMITTED** → **CONFIRMED** (or **FAILED**).
4. Use **GET /refunds/:refundId** or **GET /refunds** to track status.

Payment status will show **REFUND_SUBMITTED** then **REFUNDED** when the on-chain refund is confirmed.

## API summary

| Action            | Endpoint                   | Auth        |
| ----------------- | -------------------------- | ----------- |
| Request refund    | **POST /refunds**          | `x-api-key` |
| Get refund status | **GET /refunds/:refundId** | `x-api-key` |
| List refunds      | **GET /refunds**           | `x-api-key` |

Request body for **POST /refunds**: `{ "paymentId": "0x...", "reason": "Customer request" }` (reason optional).

## Full API spec

For request/response schemas, status values, and error codes, see the [Refunds section](/en/api/#refunds) in the full API spec.

## Next steps

- [Finalize & Cancel](/en/payments/finalize) — Release or cancel escrowed payments (before finalized)
- [Payment Status](/en/payments/status) — Status values including REFUND_SUBMITTED, REFUNDED
- [Error Codes](/en/api/errors) — API error handling
