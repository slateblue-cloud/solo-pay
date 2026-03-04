# How Payments Work & Core Architecture

An overview of SoloPay's full payment pipeline and gasless architecture.

## 2.1 Full Payment Pipeline

Every SoloPay payment is processed in the following 5 steps.

```
[1] SoloPay Widget
    POST /payments → receives paymentId, serverSignature

         ↓

[2] User Wallet (MetaMask)
    Generate EIP-712 signature (no transaction, no gas fees)

         ↓

[3] SoloPay Relayer
    Receive signature → verify signature → submit on-chain TX

         ↓

[4] Blockchain (PaymentGateway Contract)
    pay() executes → token transfer & event emitted

         ↓

[5] SoloPay → Merchant Server
    Send payment.escrowed / payment.finalized / payment.cancelled / payment.failed / payment.expired Webhook event
```

After payment is **ESCROWED**, the merchant server can call **POST /payments/:id/finalize** (or **POST /payments/:id/cancel**) to release funds to the merchant wallet or return them to the buyer. See [Finalize & Cancel](/en/payments/finalize).

### Step-by-Step

| Step                        | Actor          | Action                                                           |
| :-------------------------- | :------------- | :--------------------------------------------------------------- |
| **1. Payment Request**      | SoloPay Widget | `POST /payments` → get `paymentId`, `serverSignature`            |
| **2. Signing**              | User Wallet    | EIP-712 sign only (no TX, no gas)                                |
| **3. Relayer**              | SoloPay Server | Verify signature → submit on-chain TX                            |
| **4. Contract**             | Blockchain     | `pay()` → token escrowed                                         |
| **5. Webhook**              | SoloPay Server | Sends events to your Webhook URL (see rows below)                |
| **5a.** `payment.created`   | SoloPay Server | Right after creation. Optional: track pending                    |
| **5b.** `payment.escrowed`  | SoloPay Server | User payment confirmed on-chain. Call **finalize** or **cancel** |
| **5c.** `payment.finalized` | SoloPay Server | Your finalize TX confirmed. Complete order                       |
| **5d.** `payment.cancelled` | SoloPay Server | Your cancel TX confirmed. Close order (funds returned to buyer)  |
| **5e.** `payment.failed`    | SoloPay Server | Relay or TX failed. No escrow → retry or cancel                  |
| **5f.** `payment.expired`   | SoloPay Server | Not completed in time. No escrow → new payment if needed         |

**What happens next:**

- **Success:** You get `payment.escrowed` → you call **POST /payments/:id/finalize** → you get `payment.finalized` (funds with you).
- **Cancel (return escrow to buyer):** You get `payment.escrowed` → you call **POST /payments/:id/cancel** → you get `payment.cancelled` (funds back to buyer; payment never finalized). This is not the Refund API.
- **Refund (after finalized):** After a payment is **finalized**, you can request a refund via **POST /refunds** (status → REFUND_SUBMITTED → REFUNDED). See [Refunds](/en/payments/refunds).
- **No escrow:** You get `payment.failed` or `payment.expired` (payment never completed; no funds moved).

Details: [Webhook Events](/en/webhooks/events) · [Finalize & Cancel](/en/payments/finalize) · [Refunds](/en/payments/refunds).

## 2.2 Gasless & Relayer System

### Standard Payment vs Gasless Payment

```
Standard Payment (Direct Pay)           Gasless Payment (Gasless Pay)
────────────────────────────            ─────────────────────────────

  User                                    User
    │                                       │
    │ ① Sends transaction directly          │ ① Generates signature data only
    │   (gas: paid by user)                 │   (no transaction, no gas)
    ▼                                       ▼
PaymentGateway Contract              SoloPay Widget → SoloPay Relayer
                                             │
                                             │ ② Verifies signature, submits TX
                                             │   (gas: paid by relayer)
                                             ▼
                                    PaymentGateway Contract
```

### The Relayer's Role

The relayer is a server operated by SoloPay. It acts as the core intermediary for gasless payments.

1. **Receive Signature**: Receives the user's EIP-712 signature data from the SoloPay widget.
2. **Verify Signature**: Validates that the EIP-712 signature is correctly formatted and matches the user's address.
3. **Cover Gas Fees**: Pays gas from the relayer wallet and submits the transaction to `PaymentGateway` via the `ERC2771Forwarder` contract.
4. **Monitor Status**: Tracks the on-chain status of the transaction (`QUEUED` → `SUBMITTED` → `CONFIRMED`/`FAILED`).

::: info ERC-2771 Meta-Transactions
SoloPay uses OpenZeppelin's `ERC2771Forwarder` standard. This allows the relayer to submit transactions on behalf of the user while the contract can still correctly identify the original user (signer).
:::

## 2.3 Gasless Behavior by Token Type (Permit Support)

The level of gasless support depends on whether the token supports `Permit (EIP-2612)`.

### A. Fully Gasless — Permit-Supported Tokens (e.g., USDC)

Tokens that support EIP-2612 Permit process everything — including the first payment — with **a single signature**, with no Approve transaction required.

```
All payments including the first:

  User
    │
    │ ① EIP-2612 Permit signature (no gas)
    │ ② EIP-712 ForwardRequest signature (no gas)
    ▼
  Relayer → Contract execution (gas: paid by relayer)

→ User gas cost: 0
```

The SoloPay payment widget automatically detects Permit support and handles it accordingly.

### B. Partially Gasless — Non-Permit Tokens (Standard ERC-20)

Standard ERC-20 tokens (without Permit) require a one-time Approve via the `allowance` method.

**First time only (user pays gas)**

```
  User
    │
    │ ① Send approve(gatewayAddress, max amount) transaction
    │   (gas: paid by user — one time only)
    ▼
  Allowance registered on PaymentGateway contract
```

**All subsequent payments (fully gasless)**

```
  User
    │
    │ ① EIP-712 ForwardRequest signature (no gas)
    ▼
  Relayer → Contract execution (gas: paid by relayer)

→ No gas fees from the second payment onward
```

::: tip Infinite Approve Recommended
Approving the maximum value (`BigInt(2**256 - 1)`) in the first Approve allows hundreds of subsequent payments without additional Approves.
:::

### Permit Support Comparison

| Item                   | Permit-Supported Tokens (USDC, etc.) | Standard ERC-20         |
| ---------------------- | ------------------------------------ | ----------------------- |
| First payment gas      | None ✅                              | Required (once) ⚠️      |
| Subsequent payment gas | None ✅                              | None ✅                 |
| Implementation effort  | Low                                  | Low (one extra Approve) |

## 2.4 Transaction Status Cycle

### Payment Status

```
CREATED ──► ESCROWED ──► FINALIZE_SUBMITTED ──► FINALIZED
                    └──► CANCEL_SUBMITTED   ──► CANCELLED
CREATED ──► EXPIRED
CREATED ──► FAILED
```

| Status      | Description                                                    |
| ----------- | -------------------------------------------------------------- |
| `CREATED`   | Payment created, awaiting on-chain transaction                 |
| `ESCROWED`  | User paid; funds held in escrow (merchant can finalize/cancel) |
| `FINALIZED` | Funds released to merchant                                     |
| `CANCELLED` | Funds returned to buyer                                        |
| `FAILED`    | Transaction failed or signature validation failed              |
| `EXPIRED`   | Payment expired (30 minutes exceeded)                          |

### Relay Status (Gasless only)

```
QUEUED ──────▶ SUBMITTED ──────▶ CONFIRMED
                    │
                    ▼
                  FAILED
```

| Status      | Description                                   |
| ----------- | --------------------------------------------- |
| `QUEUED`    | Relayer received signature data, preparing TX |
| `SUBMITTED` | Relayer submitted TX to blockchain            |
| `CONFIRMED` | TX included in block and confirmed            |
| `FAILED`    | TX failed (out of gas, contract revert, etc.) |

::: info Payment Status vs Relay Status

- **Payment Status** reflects the on-chain state (e.g. ESCROWED, FINALIZED, CANCELLED).
- **Relay Status** reflects the relayer's TX submission process (QUEUED → SUBMITTED → CONFIRMED/FAILED).
- When the escrow TX is confirmed, payment status becomes ESCROWED. The merchant then calls [Finalize or Cancel](/en/payments/finalize) to release or return funds.
  :::

## Next Steps

- [Finalize & Cancel](/en/payments/finalize) — Release or cancel escrowed payments
- [Smart Contract Info](/en/developer/smart-contracts) — Contract addresses and ABI
- [Client-Side Integration](/en/developer/client-side) — Step-by-step implementation guide
