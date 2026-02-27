# @solo-pay/stress-test

Stress tests for Solo Pay: **API** (direct API calls with gasless payments) and **Client** (Playwright browser tests).

---

## Prerequisites

1. **Install dependencies**

   ```bash
   cd packages/stress-test
   pnpm install
   npx playwright install chromium
   ```

2. **Start services** (separate terminals)

   ```bash
   # Terminal 1: Hardhat node
   cd packages/contracts && pnpm dev

   # Terminal 2: Gateway + Relayer
   docker-compose up gateway simple-relayer

   # Terminal 3: Widget (for client tests)
   cd packages/widget && pnpm dev

   # Terminal 4: Sample-merchant (for client tests)
   cd packages/sample-merchant && pnpm dev
   ```

---

## Structure

```
packages/stress-test/
├── config/                    # Configuration (root level)
│   ├── networks.ts            # Network configs (hardhat, amoy)
│   └── accounts.ts            # Default Hardhat accounts
├── data/                      # Test data (gitignored)
│   └── accounts.json          # Written only during execute:client (for Playwright workers to read)
├── src/
│   ├── account-manager/       # Internal: generate/fund/storage
│   ├── ensure-accounts.ts      # setupAccountsForRun: generate + fund per run (no cache)
│   ├── api/                    # API stress test
│   │   ├── payment.ts         # Payment flow (permit + relay)
│   │   └── run.ts             # Test runner
│   └── client/                # Browser (Playwright) tests
│       ├── stress.spec.ts     # Test spec
│       └── run.ts             # Test runner
├── package.json
└── tsconfig.json
```

---

## Usage

Each run is **one-time use**: fresh accounts are generated and funded for that run only. No cache; `execute:api 10` then `execute:api 5` uses 10 new accounts, then 5 different new accounts.

### 1. API Stress Test

`pnpm execute:api` generates N accounts, funds them, runs N payments via API. Flow: create payment → sign permit → sign ForwardRequest → relay. Does not write `accounts.json`. Defaults: `amount=1`, `fund-amount=amount` (1 token per account, 1 token per payment).

```bash
# Default: 10 accounts, fund, then 10 payments
pnpm execute:api

# Custom count and options
pnpm execute:api 10 --amount=10 --network=amoy
pnpm execute:api 20 --amount=50 --network=amoy --concurrency=10
pnpm execute:api 100000 --network=amoy --concurrency=0   # all at once in one process; likely to OOM. Use --workers for large counts.
pnpm execute:api 100000 --network=amoy --workers=20      # 100k all at once: 20 processes, ≈5k in-flight per process (total ≈100k in-flight)
pnpm execute:api 10 --amount=10 --network=amoy --fund-amount=2000   # override: fund 2000 per account (default: same as amount)
```

**Running 100k payments at once (all in-flight):** Use **`--workers=N`**. A single process cannot safely run 100k connections at once (OOM). With `--workers=20`, 100k is split across 20 processes; each process runs its chunk at full concurrency (≈5k in-flight per process), so in total ≈100k payments run in parallel. Generate and funding stay in the main process; only the payment phase is parallelized across N processes.

### 2. Client (Playwright) Stress Test

`pnpm execute:client` generates N accounts, writes them to `data/accounts.json` (so Playwright workers can read), funds them, then runs browser tests. Each run uses fresh accounts.

```bash
# Default: 10 iterations
pnpm execute:client

pnpm execute:client 5                # 5 iterations
pnpm execute:client 5 --network=amoy
pnpm execute:client --headed         # Visible browser
pnpm execute:client --ui             # Playwright UI
WORKERS=5 pnpm execute:client

pnpm report:client                   # View report
```

**Test flow:**

1. Open sample-merchant (Solo Roasters)
2. Click "Order" on a product → widget popup opens
3. In widget: Connect wallet (mock Trust Wallet)
4. Sign permit + ForwardRequest
5. Verify "Payment Complete"

---

## Environment Variables

| Variable       | Description                                                                                                                  | Default                 |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `NETWORK`      | Network name (`hardhat`, `amoy`)                                                                                             | `hardhat`               |
| `RPC_URL`      | Blockchain RPC URL                                                                                                           | `http://localhost:8545` |
| `GATEWAY_URL`  | Gateway API URL                                                                                                              | `http://localhost:3001` |
| `MERCHANT_URL` | Sample-merchant URL (client only); set by network (hardhat → localhost:3004, amoy → https://sample-merchant-dev.home201.com) | Per-network default     |
| `WORKERS`      | Client: parallel workers                                                                                                     | `3`                     |

---

## Networks

| Network   | Chain ID | Description          |
| --------- | -------- | -------------------- |
| `hardhat` | 31337    | Local Hardhat node   |
| `amoy`    | 80002    | Polygon Amoy Testnet |

To add a new network, edit `config/networks.ts`.

---

## Funding and Multicall (large account counts)

For small runs (e.g. 10–100 accounts), funding uses one transaction per account (mint or transfer). For very large runs (e.g. 100,000 accounts), that would mean 100,000 transactions (slow, expensive, RPC limits).

**Multicall** batches many mints or transfers into a single transaction using the **Multicall3** contract, which is already deployed on many EVM chains (same address `0xcA11bde05977b3631167028862bE2a173976CA11`). No change to your token or gateway contracts: we only call your existing `mint()` or `transfer()` through Multicall3’s `aggregate3()`.

- **Amoy**: `funding.useMulticall: true` in `config/networks.ts`. Each transaction batches up to ~300 mints/transfers (gas limit), so e.g. 100k accounts ≈ 300–350 transactions instead of 100k.
- **Hardhat**: Multicall3 is not deployed at that address by default, so `useMulticall: false`; funding stays one tx per account.

To enable multicall for a network, set `funding.useMulticall: true` in `config/networks.ts` for that network (the chain must have Multicall3 deployed).

---

## Data file: `data/accounts.json`

- Written **only during `execute:client`** so Playwright worker processes can load the list of addresses and private keys.
- **Not used by `execute:api`** (API runner keeps accounts in memory only).
- Path is gitignored.

---

## Troubleshooting

### API test failures

- **"fetch failed"**: Gateway or relayer not running
- **"insufficient balance"**: Accounts are funded by execute; ensure network has funding (e.g. `AMOY_MASTER_PRIVATE_KEY` for amoy)
- **"nonce collision"**: Reduce concurrency or add delay between runs

### Client test failures

- **Timeout**: Ensure all services are running (gateway, widget, sample-merchant)
- **"Insufficient balance"**: execute:client auto generates + funds; ensure network funding is set
- **Quick check**: `pnpm execute:client 1 --headed`
