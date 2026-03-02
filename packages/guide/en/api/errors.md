# Error Codes

Error codes returned in API responses and how to resolve them.

## HTTP Status Codes

| Code | Description                   |
| ---- | ----------------------------- |
| 200  | Success                       |
| 201  | Created                       |
| 202  | Accepted (async processing)   |
| 400  | Bad Request (parameter error) |
| 401  | Unauthorized (key error)      |
| 403  | Forbidden                     |
| 404  | Not Found                     |
| 409  | Conflict (duplicate request)  |
| 500  | Internal Server Error         |

## Error Response Format

```json
{
  "code": "ERROR_CODE",
  "message": "Human readable message",
  "details": [...]
}
```

---

## Authentication Errors (401)

### UNAUTHORIZED

API Key or Public Key is invalid or missing.

```json
{ "code": "UNAUTHORIZED", "message": "Invalid or missing API key" }
```

---

## Validation Errors (400)

### VALIDATION_ERROR

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Input validation failed",
  "details": [{ "path": ["amount"], "message": "Expected number, received string" }]
}
```

### UNSUPPORTED_CHAIN

```json
{ "code": "UNSUPPORTED_CHAIN", "message": "Unsupported chain" }
```

**Resolution**: Check supported chains via `GET /chains`

### CHAIN_NOT_CONFIGURED

```json
{ "code": "CHAIN_NOT_CONFIGURED", "message": "Merchant chain is not configured" }
```

### CHAIN_MISMATCH

```json
{ "code": "CHAIN_MISMATCH", "message": "Token does not belong to merchant chain" }
```

### TOKEN_NOT_ENABLED

```json
{
  "code": "TOKEN_NOT_ENABLED",
  "message": "Token is not enabled for this merchant. Add and enable it in payment methods first."
}
```

**Resolution**: Add and enable the token via `POST /merchant/payment-methods`

### INVALID_PAYMENT_STATUS

Returned when a gasless (relay) request is sent for a payment that is already in a terminal state. Gasless is only allowed when payment status is **CREATED**.

```json
{
  "code": "INVALID_PAYMENT_STATUS",
  "message": "Payment is in terminal state (e.g. ESCROWED, FINALIZED, CANCELLED). Gasless requests only allowed when status is CREATED."
}
```

### PAYMENT_EXPIRED

```json
{ "code": "PAYMENT_EXPIRED", "message": "Payment has expired" }
```

### INVALID_STATUS (Finalize / Cancel)

Returned when calling **POST /payments/:id/finalize** or **POST /payments/:id/cancel** and the payment is not in **ESCROWED** status.

```json
{
  "code": "INVALID_STATUS",
  "message": "Payment must be ESCROWED to finalize. Current status: FINALIZED"
}
```

**Resolution**: Only finalize or cancel when `GET /payments/:id` returns `status === "ESCROWED"`.

### ESCROW_EXPIRED

Returned when calling **POST /payments/:id/finalize** after the escrow deadline has passed. The response body includes this code so your backend can detect and handle it (e.g. inform the user that only on-chain cancel is possible).

```json
{
  "code": "ESCROW_EXPIRED",
  "message": "Escrow deadline has expired"
}
```

**Resolution**: After the escrow deadline, finalize via API is no longer allowed. Anyone can cancel the payment on-chain (permissionless) to return funds to the buyer.

### INVALID_SIGNATURE

```json
{ "code": "INVALID_SIGNATURE", "message": "Invalid signature format" }
```

**Resolution**: Ensure signature is a hex string starting with `0x`. Verify EIP-712 domain (`name: 'ERC2771Forwarder'`, `version: '1'`).

### RELAYER_NOT_CONFIGURED

```json
{ "code": "RELAYER_NOT_CONFIGURED", "message": "No relayer configured for chain 80002" }
```

### RECIPIENT_NOT_CONFIGURED

```json
{ "code": "RECIPIENT_NOT_CONFIGURED", "message": "Merchant recipient address is not configured" }
```

### INVALID_CURRENCY

```json
{ "code": "INVALID_CURRENCY", "message": "Unsupported currency: XYZ" }
```

---

## Not Found Errors (404)

### TOKEN_NOT_FOUND

```json
{ "code": "TOKEN_NOT_FOUND", "message": "Token not found or not whitelisted for this chain" }
```

### PAYMENT_NOT_FOUND

```json
{ "code": "PAYMENT_NOT_FOUND", "message": "Payment not found" }
```

### RELAY_NOT_FOUND

```json
{ "code": "RELAY_NOT_FOUND", "message": "No relay request found for this payment" }
```

---

## Conflict Errors (409)

### DUPLICATE_ORDER

```json
{ "code": "DUPLICATE_ORDER", "message": "Order ID already used for this merchant." }
```

### CONFLICT (Finalize / Cancel)

Returned when **POST /payments/:id/finalize** or **POST /payments/:id/cancel** is called while another request is already processing the same payment (e.g. duplicate submit or race).

```json
{
  "code": "CONFLICT",
  "message": "Payment is already being processed by another request"
}
```

**Resolution**: Wait and poll **GET /payments/:id** until status is FINALIZED or CANCELLED; do not retry finalize/cancel immediately.

---

## Forbidden Errors (403)

### FORBIDDEN

```json
{ "code": "FORBIDDEN", "message": "Payment does not belong to this merchant" }
```

---

## Server Errors (500)

### CHAIN_CONFIG_ERROR

Returned when the chain or relayer configuration is missing or invalid (e.g. when calling **POST /payments/:id/finalize** or **POST /payments/:id/cancel**).

```json
{ "code": "CHAIN_CONFIG_ERROR", "message": "Chain or relayer configuration error" }
```

### SIGNING_SERVICE_ERROR

Returned when the server fails to generate the finalize or cancel signature (e.g. **POST /payments/:id/finalize**, **POST /payments/:id/cancel**).

```json
{ "code": "SIGNING_SERVICE_ERROR", "message": "Failed to generate signature" }
```

### RELAYER_ERROR

Returned when the relayer fails to submit the finalize or cancel transaction to the blockchain.

```json
{ "code": "RELAYER_ERROR", "message": "Relayer failed to submit transaction" }
```

### INTERNAL_ERROR

```json
{ "code": "INTERNAL_ERROR", "message": "An internal error occurred" }
```

## Next Steps

- [Webhooks](/en/webhooks/) - Event-based processing
