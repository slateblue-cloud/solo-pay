# Payment History

Query merchant payment history. Requires API Key authentication.

## REST API

```bash
# Query by orderId
curl "https://pay-api.staging.sut.com/api/v1/merchant/payments?orderId=order-001" \
  -H "x-api-key: sk_xxxxx"

# Query by paymentId
curl "https://pay-api.staging.sut.com/api/v1/merchant/payments/0xabc123..." \
  -H "x-api-key: sk_xxxxx"
```

## Response

```json
{
  "paymentId": "0xabc123...",
  "orderId": "order-001",
  "status": "FINALIZED",
  "amount": "10500000000000000000",
  "tokenSymbol": "SUT",
  "tokenDecimals": 18,
  "txHash": "0xdef789...",
  "payerAddress": "0x1234...",
  "createdAt": "2024-01-26T12:30:00Z",
  "confirmedAt": "2024-01-26T12:35:42Z",
  "expiresAt": "2024-01-26T13:00:00Z"
}
```

## Response Fields

| Field           | Type     | Description                                                                                                                |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------- |
| `paymentId`     | `string` | Unique payment identifier (bytes32 hash)                                                                                   |
| `orderId`       | `string` | Merchant order ID                                                                                                          |
| `status`        | `string` | CREATED, ESCROWED, FINALIZE_SUBMITTED, FINALIZED, CANCEL_SUBMITTED, CANCELLED, REFUND_SUBMITTED, REFUNDED, EXPIRED, FAILED |
| `amount`        | `string` | Amount in wei                                                                                                              |
| `tokenSymbol`   | `string` | Token symbol                                                                                                               |
| `tokenDecimals` | `number` | Token decimals                                                                                                             |
| `txHash`        | `string` | On-chain transaction hash (present after confirmation)                                                                     |
| `payerAddress`  | `string` | Payer wallet address (present after confirmation)                                                                          |
| `confirmedAt`   | `string` | Payment confirmation timestamp                                                                                             |
| `expiresAt`     | `string` | Payment expiry timestamp                                                                                                   |

## On-chain Query via Subgraph

You can also query on-chain payment events directly via Subgraph.

```graphql
query PaymentHistory($payer: Bytes!) {
  paymentReceivedEvents(
    where: { payer: $payer }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 10
  ) {
    id
    paymentId
    payer
    token
    amount
    transactionHash
    blockTimestamp
  }
}
```

::: tip Subgraph Usage
Use Subgraph for bulk history queries or complex filtering.
:::

## Next Steps

- [Refunds](/en/payments/refunds) - Payment refund processing
- [Error Codes](/en/api/errors) - Error handling
