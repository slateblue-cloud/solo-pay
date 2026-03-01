# Client-Side Integration

SoloPay provides a client-side integration method using the payment widget.

## Integration Method

Calls the SoloPay payment widget. The widget handles payment creation, wallet connection, signing, and processing — merchants only need to call the widget and verify the result.

```
Merchant Frontend  ──(call widget)──▶  SoloPay Widget
                                            │
                           Create payment + connect wallet + process payment
                                            │
          │◀──(redirect to successUrl/failUrl)─│
          │
          │──(verify payment via paymentId)──▶  SoloPay API
```

SoloPay's widget handles all complex Web3 logic including payment creation, gasless signing, and Approve processing. Merchants only need to call the widget and verify the result.

## Next Steps

- [Client-Side Integration Guide](/en/developer/client-side) — Step-by-step implementation guide
- [Webhook Setup](/en/webhooks/) — Reliable payment status reception
