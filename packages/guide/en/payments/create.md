# Create Payment

Create a payment and receive a unique payment ID.

## Overview

When using the SoloPay widget, **payment creation is handled automatically by the widget**. This page is a reference API spec for understanding the internals or for custom implementations.

Created payments **expire automatically after 30 minutes**.

- Auth: `x-public-key` header required (pk_live_xxx or pk_test_xxx)
- Chain and recipient address are determined by merchant configuration
- `tokenAddress` must be whitelisted and enabled for the merchant

## REST API

```bash
curl -X POST https://pay-api.staging.msq.com/api/v1/payments \
  -H "x-public-key: pk_test_xxxxx" \
  -H "Origin: https://yourshop.com" \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "order-001",
    "amount": 10.5,
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "successUrl": "https://example.com/success",
    "failUrl": "https://example.com/fail"
  }'
```

## Request Parameters

| Field          | Type      | Req. | Description                                                        |
| -------------- | --------- | ---- | ------------------------------------------------------------------ |
| `orderId`      | `string`  | ✓    | Merchant order ID (no duplicates per merchant)                     |
| `amount`       | `number`  | ✓    | Payment amount (token units or fiat units)                         |
| `tokenAddress` | `address` | ✓    | ERC-20 token contract address (whitelisted & enabled for merchant) |
| `successUrl`   | `string`  | ✓    | Redirect URL on success                                            |
| `failUrl`      | `string`  | ✓    | Redirect URL on failure                                            |
| `currency`     | `string`  |      | Fiat currency code (e.g., `USD`, `KRW`). Triggers price conversion |

::: tip currency option
When `currency` is provided, `amount` is treated as a fiat amount. The server fetches the token price and converts automatically.
Example: `amount: 10, currency: "USD"` → pays 10 USD worth of tokens
:::

## Response

### Success (201 Created)

```json
{
  "success": true,
  "paymentId": "0xabc123def456...",
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

### Error Responses

| HTTP | Code                       | Cause                                     |
| ---- | -------------------------- | ----------------------------------------- |
| 400  | `TOKEN_NOT_ENABLED`        | Token is not enabled for this merchant    |
| 400  | `TOKEN_NOT_FOUND`          | Token not in whitelist                    |
| 400  | `UNSUPPORTED_CHAIN`        | Unsupported chain                         |
| 400  | `CHAIN_NOT_CONFIGURED`     | Merchant has no chain configured          |
| 400  | `RECIPIENT_NOT_CONFIGURED` | Merchant recipient address not configured |
| 400  | `VALIDATION_ERROR`         | Input validation failed                   |
| 409  | `DUPLICATE_ORDER`          | orderId already used                      |

## Response Fields

| Field              | Type       | Description                                |
| ------------------ | ---------- | ------------------------------------------ |
| `paymentId`        | `string`   | Unique payment identifier (bytes32 hash)   |
| `serverSignature`  | `string`   | Server EIP-712 signature for contract auth |
| `amount`           | `string`   | Amount in wei                              |
| `gatewayAddress`   | `address`  | PaymentGateway contract address            |
| `forwarderAddress` | `address`  | ERC2771 Forwarder address (for Gasless)    |
| `merchantId`       | `string`   | Merchant ID (bytes32)                      |
| `feeBps`           | `number`   | Fee in basis points (100 = 1%)             |
| `expiresAt`        | `datetime` | Payment expiry (30 minutes from creation)  |

## When Using the Widget

When using the widget (`@solo-pay/widget-js` / `@solo-pay/widget-react`), there is no need to call this API directly — the widget handles it automatically.

See [Client-Side Integration Guide](/en/developer/client-side)

## Next Steps

- [Payment Status](/en/payments/status) - Check payment progress
- [How Payments Work](/en/developer/how-it-works) - Gasless architecture
