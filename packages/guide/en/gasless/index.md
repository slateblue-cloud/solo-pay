# Gasless Payment

Users can pay with just a signature — no gas fees required.

## Overview

Gasless payments use the **ERC-2771 meta-transaction** standard. Users can pay with ERC-20 tokens without needing native tokens (MATIC, ETH, etc.) for gas.

::: tip Use Cases

- New user onboarding (first payment without gas)
- Better UX (pay with just a signature)
- Eliminate gas fee volatility
  :::

## Regular vs. Gasless Payment

```
Regular Payment                    Gasless Payment
──────────────                     ──────────────────

  User                               User
    │                                  │
    │ Send TX                          │ Sign only
    │ (pay gas)                        │ (no gas)
    ▼                                  ▼
  Contract                          Relayer
                                        │
                                        │ Send TX
                                        │ (pay gas)
                                        ▼
                                    Contract
```

## Components

### 1. EIP-712 Signature

A typed signature created by the user's wallet.

- Domain, types, and message are clearly displayed
- User can verify signature content
- Replay attack prevention (nonce, deadline)

### 2. ERC2771 Forwarder

OpenZeppelin's `ERC2771Forwarder` contract.

- Signature verification
- Restores original sender (`_msgSender()`)
- Forwards calls to PaymentGateway

### 3. Relayer

Converts signed requests into on-chain transactions.

- Validates signature format
- Pays gas fees
- Submits and monitors transactions

## Relay Status Flow

```
QUEUED ────▶ SUBMITTED ────▶ CONFIRMED
                │
                ▼
              FAILED
```

| Status      | Description           |
| ----------- | --------------------- |
| `QUEUED`    | Relay request queued  |
| `SUBMITTED` | Transaction submitted |
| `CONFIRMED` | Transaction confirmed |
| `FAILED`    | Transaction failed    |

## Limitations

- Token must be approved for the PaymentGateway contract in advance
- A Relayer service must be configured for the chain
- `forwarderAddress` is included in the payment creation response (if missing, Gasless is not supported)

## Supported Chains

| Chain        | Network ID |
| ------------ | ---------- |
| Polygon Amoy | 80002      |
| BSC Testnet  | 97         |
| Sepolia      | 11155111   |

## Next Steps

- [Implementation Guide](/en/gasless/implementation) - Detailed implementation guide
