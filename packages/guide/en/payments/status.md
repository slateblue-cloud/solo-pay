# Payment Status

Query the current status of a payment.

- Auth: `x-public-key` header required
- For GET requests, use `x-origin` header instead of `Origin` in proxy environments

## REST API

```bash
curl https://pay-api.staging.msq.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

## Response

### Success (200 OK)

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
    "createdAt": "2024-01-26T12:30:00Z",
    "updatedAt": "2024-01-26T12:35:42Z",
    "payment_hash": "0xabc123...",
    "network_id": 80002,
    "token_symbol": "SUT"
  }
}
```

## Status Flow

```
CREATED ──────────▶ PENDING ──────────▶ CONFIRMED
    │                  │
    │                  │
    ▼                  ▼
 EXPIRED            FAILED
```

## Status Descriptions

| Status      | Description                                   | Next Action            |
| ----------- | --------------------------------------------- | ---------------------- |
| `CREATED`   | Payment created, awaiting user action         | User initiates payment |
| `PENDING`   | Transaction submitted, awaiting block confirm | Wait (usually seconds) |
| `CONFIRMED` | Payment complete, block confirmed             | Process completion     |
| `FAILED`    | Transaction failed                            | Create new payment     |
| `EXPIRED`   | Expired (30 minutes exceeded)                 | Create new payment     |

::: tip On-chain Sync
GET /payments/:id syncs blockchain and database status in real-time. Once on-chain completion is confirmed, status is automatically updated to `CONFIRMED`.
:::

## Next Steps

- [How Payments Work](/en/developer/how-it-works) - Gasless architecture
- [Error Codes](/en/api/errors) - Error handling
