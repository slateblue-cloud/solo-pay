# Faucet Manager (`@solo-pay/faucet-manager`)

[English](README.md) | [한국어](README.ko.md)

Library and HTTP service for one-time gas (native token) grants per wallet per chain. Used so users can receive gas for the approve step before paying. **Gas is sent via the relayer API** (simple-relayer in dev, solo-relayer-service in prod); no separate faucet wallet.

## Overview

- **Conditions:** Payment exists; token balance ≥ payment amount; native balance < approve cost; no prior grant for (wallet, chain).
- **Grant amount:** `48_000 * gasPrice` wei (enough for one approve, below transfer to limit abuse).
- **Ports:** Implemented by this service (getPaymentInfo, findWalletGasGrant, getTokenBalance, getNativeBalance, getGasPrice, sendNative, createWalletGasGrant). Auth: x-public-key and Origin (merchant allowed_domains).

## Environment

- Relayer URL is read from the database per chain (`chains.relayer_url`), same as the gateway. No `RELAY_API_URL` env.
- **RELAY*API_KEY*&lt;chainId&gt;** (optional): API key for the relayer for that chain (e.g. `RELAY_API_KEY_31337`, `RELAY_API_KEY_80002`). Required when the relayer API expects an API key.

## Build and run

```bash
pnpm --filter @solo-pay/faucet-manager build
pnpm --filter @solo-pay/faucet-manager start
```

Runs on port **3002** by default (`PORT` env). With Docker Compose the service is exposed on host port **3003** (`3003:3002`). Check health: `GET http://localhost:3002/health` (or `http://localhost:3003/health` when using Docker). Request-gas is **POST only**; GET returns 405.

## Test

```bash
pnpm --filter @solo-pay/faucet-manager test
```
