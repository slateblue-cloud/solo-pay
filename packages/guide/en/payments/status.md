# Payment Status

Query the current status of a payment.

- Auth: `x-public-key` header required
- For GET requests, use `x-origin` header instead of `Origin` in proxy environments

## REST API

```bash
curl https://pay-api.staging.sut.com/api/v1/payments/0xabc123... \
  -H "x-public-key: pk_test_xxxxx"
```

## Response

### Success (200 OK)

```json
{
  "success": true,
  "data": {
    "paymentId": "0xabc123...",
    "status": "ESCROWED",
    "amount": "10500000000000000000",
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "tokenSymbol": "SUT",
    "payerAddress": "0x...",
    "treasuryAddress": "0xMerchantWallet...",
    "transactionHash": "0xdef789...",
    "releaseTxHash": null,
    "deadline": "1706281200",
    "escrowDuration": "300",
    "createdAt": "2024-01-26T12:30:00Z",
    "updatedAt": "2024-01-26T12:35:42Z",
    "payment_hash": "0xabc123...",
    "network_id": 80002,
    "token_symbol": "SUT"
  }
}
```

- **transactionHash** — Escrow (pay) transaction hash.
- **releaseTxHash** — Finalize or cancel transaction hash; present when status is FINALIZE_SUBMITTED, FINALIZED, CANCEL_SUBMITTED, or CANCELLED.
- **escrowDuration** — Escrow duration in seconds. The API does not return the exact escrow deadline (ISO datetime); use this value to know how long the merchant has to finalize after the payment is escrowed.

## Status Flow

```
CREATED ──► ESCROWED ──► FINALIZE_SUBMITTED ──► FINALIZED
                    └──► CANCEL_SUBMITTED   ──► CANCELLED ──► REFUND_SUBMITTED ──► REFUNDED

CREATED ──► EXPIRED
CREATED ──► FAILED
```

## Status Descriptions

| Status               | Description                                    | Next Action                                                                 |
| -------------------- | ---------------------------------------------- | --------------------------------------------------------------------------- |
| `CREATED`            | Payment created, awaiting on-chain transaction | User initiates payment                                                      |
| `ESCROWED`           | Payment escrowed on-chain                      | Merchant: call [Finalize](/en/payments/finalize) or Cancel to release funds |
| `FINALIZE_SUBMITTED` | Finalize transaction submitted                 | Wait for FINALIZED (poll or webhook)                                        |
| `FINALIZED`          | Funds released to merchant                     | None (terminal)                                                             |
| `CANCEL_SUBMITTED`   | Cancel transaction submitted                   | Wait for CANCELLED                                                          |
| `CANCELLED`          | Funds returned to buyer                        | None (terminal)                                                             |
| `REFUND_SUBMITTED`   | Refund transaction submitted                   | Wait for REFUNDED                                                           |
| `REFUNDED`           | Refund completed                               | None (terminal)                                                             |
| `FAILED`             | Transaction failed                             | Create new payment                                                          |
| `EXPIRED`            | Expired (30 minutes exceeded)                  | Create new payment                                                          |

::: tip On-chain Sync
GET /payments/:id syncs blockchain and database status in real-time. For a successful payment, status is **ESCROWED** (user paid, funds in escrow) or **FINALIZED** (funds released to merchant).
:::

## Next Steps

- [Finalize & Cancel](/en/payments/finalize) - Release or cancel escrowed payments
- [How Payments Work](/en/developer/how-it-works) - Gasless architecture
- [Error Codes](/en/api/errors) - Error handling
