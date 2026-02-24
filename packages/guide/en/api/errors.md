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

```json
{
  "code": "INVALID_PAYMENT_STATUS",
  "message": "Payment status is CONFIRMED. Gasless requests only allowed in CREATED or PENDING state."
}
```

### PAYMENT_EXPIRED

```json
{ "code": "PAYMENT_EXPIRED", "message": "Payment has expired" }
```

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

---

## Forbidden Errors (403)

### FORBIDDEN

```json
{ "code": "FORBIDDEN", "message": "Payment does not belong to this merchant" }
```

---

## Server Errors (500)

### INTERNAL_ERROR

```json
{ "code": "INTERNAL_ERROR", "message": "An internal error occurred" }
```

## Next Steps

- [Webhooks](/en/webhooks/) - Event-based processing
