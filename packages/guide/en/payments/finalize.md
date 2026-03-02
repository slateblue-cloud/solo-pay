# Finalize & Cancel Escrowed Payment

After a payment reaches **ESCROWED** status, the merchant must choose: **finalize** (release funds to the merchant wallet) or **cancel** (return funds to the buyer). Both actions are performed from your **merchant server** using the API key.

## Who Can Call

- **POST /payments/:id/finalize** — Only the **merchant** that owns the payment (authenticated with `x-api-key`). Must be called before the **escrow deadline**; after the deadline the API returns `ESCROW_EXPIRED`.
- **POST /payments/:id/cancel** — Only the **merchant** that owns the payment (authenticated with `x-api-key`). Valid while payment is ESCROWED. After the **escrow deadline**, anyone can cancel the payment **on-chain** (directly on the contract) without using this API; the API is for the merchant to cancel before or within the deadline.

## Expiry vs Escrow Deadline

- **Payment EXPIRED** — The payment was never completed within the creation expiry window (e.g. 30 minutes exceeded). Status becomes `EXPIRED`; no escrow occurred. Create a new payment to retry.
- **Escrow deadline** — Once a payment is ESCROWED, the merchant has until the escrow deadline to **finalize** (release funds). After the escrow deadline, finalize via API returns `ESCROW_EXPIRED`, and the contract may allow **permissionless cancel** on-chain (anyone can call cancel on the contract to return funds to the buyer).

## When to Call

- After you receive the **payment.escrowed** webhook, or
- After **GET /payments/:id** returns `status: "ESCROWED"`

Then call **POST /payments/:id/finalize** to release funds to your wallet, or **POST /payments/:id/cancel** to return funds to the buyer.

## Finalize (Release to Merchant)

**Endpoint:** `POST /payments/:id/finalize`  
**Auth:** `x-api-key` (API key only; not public key)

No request body. The payment ID is in the URL path.

### Example

```bash
curl -X POST https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-api-key: sk_test_xxxxx"
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "relayRequestId": "uuid-...",
    "transactionHash": null,
    "status": "submitted"
  }
}
```

The response `data.status` is the **relay submission state** (`submitted` or `pending`), not the payment status. The payment status in the database becomes **FINALIZE_SUBMITTED**; after the on-chain transaction confirms it becomes **FINALIZED** and you receive the **payment.finalized** webhook. Poll **GET /payments/:id** until `status === "FINALIZED"` to confirm.

::: tip Escrow Deadline
Finalize must be called before the escrow deadline. After the deadline, the API returns `ESCROW_EXPIRED` and the contract may allow anyone to cancel on-chain (permissionless).
:::

## Cancel (Return to Buyer)

**Endpoint:** `POST /payments/:id/cancel`  
**Auth:** `x-api-key` (merchant only; payment must belong to this merchant)

No request body. Same pattern as finalize. After the escrow deadline, anyone may cancel on-chain without this API.

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "relayRequestId": "uuid-...",
    "transactionHash": null,
    "status": "submitted"
  }
}
```

As with finalize, `data.status` is the relay submission state. The payment status becomes **CANCEL_SUBMITTED** then **CANCELLED** after on-chain confirmation; you then receive the **payment.cancelled** webhook.

## Error Codes

| HTTP | Code                                                                     | Meaning                                             |
| ---- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| 400  | INVALID_STATUS                                                           | Payment is not ESCROWED                             |
| 400  | ESCROW_EXPIRED                                                           | Escrow deadline passed (finalize only)              |
| 403  | FORBIDDEN                                                                | Payment does not belong to this merchant            |
| 404  | PAYMENT_NOT_FOUND                                                        | Payment not found                                   |
| 409  | CONFLICT                                                                 | Concurrent finalize/cancel (e.g. already submitted) |
| 500  | CHAIN_CONFIG_ERROR, SIGNING_SERVICE_ERROR, RELAYER_ERROR, INTERNAL_ERROR | Server or chain issue                               |

See [Error Codes](/en/api/errors) for full details.

## Next Steps

- [Payment Status](/en/payments/status) - All status values and flow
- [Webhook Events](/en/webhooks/events) - payment.escrowed, payment.finalized, payment.cancelled
- [API Reference](/en/api/) - Full endpoint spec
