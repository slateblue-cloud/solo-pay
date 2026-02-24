# API Reference

Full SoloPay REST API specification.

## Base URL

| Environment | URL                                      |
| ----------- | ---------------------------------------- |
| Production  | `https://pay-api.msq.com/api/v1`         |
| Staging     | `https://pay-api.staging.msq.com/api/v1` |
| Development | `http://localhost:3001/api/v1`           |

## Authentication

| Method     | Header         | Endpoints                                                                     |
| ---------- | -------------- | ----------------------------------------------------------------------------- |
| Public Key | `x-public-key` | POST /payments, GET /payments/:id, POST/GET /payments/:id/relay               |
| API Key    | `x-api-key`    | GET /merchant/\*, POST /merchant/payment-methods, POST /refunds, GET /refunds |
| None       | -              | GET /chains, GET /chains/tokens                                               |

---

## Payments

### POST /payments

Create a payment. **Auth**: `x-public-key` + `Origin`

```json
{
  "orderId": "order-001",
  "amount": 10.5,
  "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  "successUrl": "https://example.com/success",
  "failUrl": "https://example.com/fail",
  "currency": "USD"
}
```

**Response (201)**

```json
{
  "success": true,
  "paymentId": "0xabc123...",
  "orderId": "order-001",
  "serverSignature": "0x...",
  "chainId": 80002,
  "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
  "tokenSymbol": "SUT",
  "tokenDecimals": 18,
  "gatewayAddress": "0x...",
  "forwarderAddress": "0x...",
  "amount": "10500000000000000000",
  "recipientAddress": "0xMerchantWallet...",
  "merchantId": "0x...",
  "feeBps": 100,
  "successUrl": "https://example.com/success",
  "failUrl": "https://example.com/fail",
  "expiresAt": "2024-01-26T13:00:00.000Z"
}
```

---

### GET /payments/:id

Get payment status. **Auth**: `x-public-key`

**Response (200)**

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "status": "CONFIRMED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "payerAddress": "0x...",
    "treasuryAddress": "0xMerchantWallet...",
    "transactionHash": "0xdef789...",
    "blockNumber": 12345678,
    "payment_hash": "0xabc123...",
    "network_id": 80002,
    "token_symbol": "SUT",
    "createdAt": "2024-01-26T12:30:00Z",
    "updatedAt": "2024-01-26T12:35:42Z"
  }
}
```

---

### POST /payments/:id/relay

Submit a Gasless payment (ERC-2771). **Auth**: `x-public-key` + `Origin`

```json
{
  "paymentId": "0xabc123...",
  "forwarderAddress": "0x...",
  "forwardRequest": {
    "from": "0x...",
    "to": "0x...",
    "value": "0",
    "gas": "200000",
    "nonce": "1",
    "deadline": "1706281200",
    "data": "0x...",
    "signature": "0x..."
  }
}
```

**Response (202)**

```json
{ "success": true, "status": "submitted", "message": "Gasless transaction submitted" }
```

---

### GET /payments/:id/relay

Get relay status. **Auth**: `x-public-key`

```json
{
  "success": true,
  "data": {
    "status": "CONFIRMED",
    "transactionHash": "0xdef789...",
    "errorMessage": null,
    "createdAt": "2024-01-26T12:34:00Z",
    "updatedAt": "2024-01-26T12:35:42Z"
  }
}
```

**Status values**: `QUEUED` → `SUBMITTED` → `CONFIRMED` (or `FAILED`)

---

## Merchant

### GET /merchant

Get merchant info. **Auth**: `x-api-key`

```json
{
  "success": true,
  "merchant": {
    "id": 1,
    "merchant_key": "my-store",
    "name": "My Store",
    "chain_id": 80002,
    "chain": { "id": 1, "network_id": 80002, "name": "Polygon Amoy", "is_testnet": true },
    "webhook_url": null,
    "public_key": "pk_test_xxx",
    "is_enabled": true,
    "payment_methods": [...]
  },
  "chainTokens": [...]
}
```

---

### GET /merchant/payment-methods

List payment methods. **Auth**: `x-api-key`

---

### POST /merchant/payment-methods

Add a payment method. **Auth**: `x-api-key`

```json
{ "tokenAddress": "0x...", "is_enabled": true }
```

---

### PATCH /merchant/payment-methods/:id

Update a payment method. **Auth**: `x-api-key`

```json
{ "is_enabled": false }
```

---

### GET /merchant/payments

List payments. **Auth**: `x-api-key`. Query: `orderId`

---

### GET /merchant/payments/:id

Get payment detail. **Auth**: `x-api-key`

---

## Refunds

### POST /refunds

Request a refund. **Auth**: `x-api-key`

```json
{ "paymentId": "0xabc123...", "reason": "Customer request" }
```

**Response (201)**

```json
{
  "success": true,
  "data": {
    "refundId": "uuid-...",
    "paymentId": "0xabc123...",
    "amount": "10500000000000000000",
    "tokenAddress": "0x...",
    "payerAddress": "0x...",
    "status": "PENDING",
    "serverSignature": "0x...",
    "merchantId": "0x...",
    "createdAt": "2024-01-26T12:40:00Z"
  }
}
```

---

### GET /refunds/:refundId

Get refund status. **Auth**: `x-api-key`

**Status**: `PENDING` → `SUBMITTED` → `CONFIRMED` (or `FAILED`)

---

### GET /refunds

List refunds. **Auth**: `x-api-key`. Query: `page`, `limit`, `status`, `paymentId`

---

## Chains

### GET /chains

Get supported chains. **No auth required.**

```json
{
  "success": true,
  "chains": [
    { "id": 1, "network_id": 80002, "name": "Polygon Amoy", "is_testnet": true },
    { "id": 2, "network_id": 97, "name": "BSC Testnet", "is_testnet": true },
    { "id": 3, "network_id": 11155111, "name": "Sepolia", "is_testnet": true }
  ]
}
```

---

### GET /chains/tokens

Get all chains with their tokens. **No auth required.**

---

## Health

### GET /health

Server health check. **No auth required.**

```json
{ "status": "ok", "timestamp": "2024-01-26T12:00:00.000Z" }
```

## Next Steps

- [Error Codes](/en/api/errors) - Error handling
