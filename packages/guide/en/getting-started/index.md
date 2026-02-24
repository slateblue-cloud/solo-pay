# Overview

SoloPay is a blockchain payment gateway. It provides APIs and an SDK to help merchants easily accept ERC-20 token payments.

## Key Features

### Payment API

- Payment creation and unique ID issuance (orderId-based duplicate prevention)
- Real-time payment status queries
- Merchant payment history lookup (by orderId or paymentId)

### Gasless Payment

- Users pay with just a signature — no gas fees
- Based on the ERC-2771 meta-transaction standard
- Relayer submits transactions on behalf of users

### Refunds

- Refund requests for completed payments
- Status tracking: PENDING → SUBMITTED → CONFIRMED

### Webhook

- Real-time notifications on payment status changes
- No polling required, saves server resources

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ Merchant Srv │────▶│  SoloPay API │────▶│  Blockchain  │
└─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │
       │ (Public Key)       │                   │
       ▼                   ▼                   ▼
   SDK Usage          Payment Mgmt       TX Processing
```

## Authentication

| Endpoint                 | Method                           |
| ------------------------ | -------------------------------- |
| POST /payments           | `x-public-key` + `Origin` header |
| GET /payments/:id        | `x-public-key` + `Origin` header |
| POST /payments/:id/relay | `x-public-key` + `Origin` header |
| GET /merchant/\*         | `x-api-key` header               |
| POST /refunds            | `x-api-key` header               |
| GET /chains              | No auth (Public)                 |

## Payment Flow

1. **Create Payment**: Merchant server sends payment creation request to SoloPay API
2. **User Payment**: User transfers tokens or signs (Gasless) from their wallet
3. **Status Check**: Transaction confirmed on blockchain
4. **Completion**: Check payment status via polling or Webhook

## Next Steps

- [Quick Start](/en/getting-started/quick-start) - Integrate your first payment in 5 minutes
- [Authentication](/en/getting-started/authentication) - API Key setup
