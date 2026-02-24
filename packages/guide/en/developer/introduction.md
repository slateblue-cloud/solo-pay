# Service Overview

SoloPay is a blockchain-based payment gateway. It provides a REST API and SDK to help merchants easily integrate ERC-20 token payments into their services.

## About SoloPay

SoloPay's core feature is **Gasless Payment**. Users simply sign once in a wallet like MetaMask to complete a payment. Gas fees (network transaction fees) are covered by the SoloPay relayer server.

### Key Benefits

| Feature                   | Description                                                                 |
| ------------------------- | --------------------------------------------------------------------------- |
| **Gas-free UX**           | Users complete payments with just a signature — no ETH/MATIC required      |
| **Fast Integration**      | Integrate via REST API or SDK within hours                                  |
| **orderId Deduplication** | Idempotency guaranteed based on order ID                                    |
| **Real-time Alerts**      | Receive payment status changes instantly via Webhook                        |
| **Multi-token Support**   | Merchants can specify any ERC-20 token as the payment method                |
| **Built-in Refunds**      | Handle on-chain refunds via API                                             |

## Supported Networks and Assets

### Supported Chains

Currently testnet environments are supported.

| Chain        | Network ID | Type    |
| ------------ | ----------- | ------- |
| Polygon Amoy | 80002       | Testnet |

::: info Mainnet Support Coming Soon
Mainnet support (Ethereum, Polygon PoS, etc.) will be announced in the future. We recommend implementing and validating your integration on testnet first.
:::

### Supported Tokens

Merchants can specify which ERC-20 tokens to accept as payment. Tokens must be registered on SoloPay's platform whitelist.

::: tip Permit (EIP-2612) Supported Tokens
Tokens that support EIP-2612 such as USDC enable **100% gasless payments from the very first transaction** — no Approve transaction required. Check the contract spec of the token you intend to integrate.
:::

## Prerequisites

The following steps are required to use SoloPay.

### 1. Merchant Registration

Contact the SoloPay operations team to register as a merchant. The following information is required:

- Your service (e.g., store) domain
- The chain you will use (e.g., Polygon Amoy 80002)
- Recipient wallet address (the ERC-20 token wallet to receive payments)
- The token address to use for payments

### 2. API Key Issuance

After merchant registration, you will receive two keys from the operations team.

| Key Type       | Prefix                        | Purpose                                | Usage                    |
| -------------- | ----------------------------- | -------------------------------------- | ------------------------ |
| **API Key**    | `sk_...`                      | Admin/management operations (setup)    | Never in client code     |
| **Public Key** | `pk_test_...` / `pk_live_...` | Payment creation, status queries       | Client-side (widget)     |

::: danger API Key Security
Never include API Keys starting with `sk_` in frontend code. The API Key is for admin/management setup only and is not required for client-side widget integration.
:::

### 3. Activate Payment Methods (Tokens)

After merchant registration, activate the tokens you want to use for payment. This is a one-time admin setup step performed outside the client-side integration.

::: info Admin Setup
Contact the SoloPay operations team or use the dashboard to activate payment methods. If using the API directly, the `POST /merchant/payment-methods` endpoint requires the API Key (`sk_...`).
:::

## Next Steps

- [How Payments Work](/en/developer/how-it-works) — Understand the full pipeline and architecture
- [Choose Integration Method](/en/developer/integration-methods) — Select the method that fits your setup
- [Quick Start](/en/getting-started/quick-start) — Create your first payment in 5 minutes
