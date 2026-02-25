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
├── data/                      # Test data (root level)
│   └── accounts.json          # Generated accounts (gitignored)
├── src/
│   ├── account-manager/       # Account management
│   │   └── cli.ts             # CLI for generate/fund/list
│   ├── api/                   # API stress test
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

### 1. Account Management

Generate and fund test accounts:

```bash
# Generate 50 deterministic accounts for hardhat
pnpm accounts:generate --count=50 --network=hardhat

# Fund accounts with tokens (1000 tokens each)
pnpm accounts:fund --network=hardhat --amount=1000

# List accounts and balances
pnpm accounts:list --network=hardhat

# Clear saved accounts
pnpm accounts:clear
```

### 2. API Stress Test

Direct API calls without browser - tests the payment flow:

1. Create payment (POST /api/v1/payments)
2. Sign EIP-2612 permit (gasless approval)
3. Sign EIP-712 ForwardRequest
4. Submit relay (POST /api/v1/payments/:id/relay)

The number of tests defaults to all accounts in `accounts.json`, but can be limited.

```bash
# Basic usage (runs all accounts from accounts.json)
pnpm execute:api

# Run subset of accounts
pnpm execute:api 10                      # Run only first 10 accounts
pnpm execute:api --count=20              # Run only first 20 accounts

# With options
pnpm execute:api --concurrency=10        # 10 parallel requests
pnpm execute:api --amount=50             # 50 tokens per payment
pnpm execute:api --network=amoy          # Test on Amoy testnet
```

**Output:**

```
╔══════════════════════════════════════════════════════════╗
║                  STRESS TEST RESULTS                     ║
╠══════════════════════════════════════════════════════════╣
║  Total Requests:     50                                  ║
║  Successful:         50                                  ║
║  Failed:             0                                   ║
║  Success Rate:       100.00%                             ║
╠══════════════════════════════════════════════════════════╣
║  Throughput: 16.35 successful payments/second            ║
╚══════════════════════════════════════════════════════════╝
```

### 3. Client (Playwright) Stress Test

Browser-based tests simulating real users. Defaults to all accounts, can be limited.

```bash
# Basic usage (runs all accounts from accounts.json)
pnpm execute:client

# Run subset of accounts
pnpm execute:client 5                # Run only first 5 accounts

# With options
pnpm execute:client --headed         # Visible browser
pnpm execute:client --ui             # Playwright UI mode
pnpm execute:client --debug          # Debug step-through

# Override workers
WORKERS=5 pnpm execute:client

# View report
pnpm report:client
```

**Test flow:**

1. Open sample-merchant (Solo Roasters)
2. Click "Order" on a product → widget popup opens
3. In widget: Connect wallet (mock Trust Wallet)
4. Sign permit + ForwardRequest
5. Verify "Payment Complete"

---

## Environment Variables

| Variable       | Description                       | Default                 |
| -------------- | --------------------------------- | ----------------------- |
| `NETWORK`      | Network name (`hardhat`, `amoy`)  | `hardhat`               |
| `RPC_URL`      | Blockchain RPC URL                | `http://localhost:8545` |
| `GATEWAY_URL`  | Gateway API URL                   | `http://localhost:3001` |
| `MERCHANT_URL` | Sample-merchant URL (client only) | `http://localhost:3004` |
| `WORKERS`      | Client: parallel workers          | `3`                     |

---

## Networks

| Network   | Chain ID | Description          |
| --------- | -------- | -------------------- |
| `hardhat` | 31337    | Local Hardhat node   |
| `amoy`    | 80002    | Polygon Amoy Testnet |

To add a new network, edit `config/networks.ts`.

---

## Troubleshooting

### API Test Failures

- **"fetch failed"**: Gateway or relayer not running
- **"insufficient balance"**: Run `pnpm accounts:fund` first
- **"nonce collision"**: Reduce concurrency or wait between runs

### Client Test Failures

- **Timeout**: Ensure all services are running (gateway, widget, sample-merchant)
- **"Insufficient balance"**: Accounts need tokens - run `pnpm accounts:fund`
- **Quick sanity check**: `REPEAT=1 WORKERS=1 pnpm execute:client --headed`
