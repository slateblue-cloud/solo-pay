# Solo Pay Security Audit Report

**Date:** 2026-03-05  
**Auditor:** Automated Security Review  
**Scope:** Full codebase (`/tmp/solo-pay`)

---

## Executive Summary

Solo Pay is an escrow-based blockchain payment gateway with meta-transaction (gasless) support. The overall architecture is sound—smart contracts use OpenZeppelin's battle-tested libraries, API keys are stored as SHA-256 hashes, and EIP-712 signatures are properly verified. However, several significant vulnerabilities were identified across the stack.

**Critical: 2 | High: 5 | Medium: 7 | Low: 4**

---

## 1. Smart Contracts (`packages/contracts/src/`)

### 1.1 [Medium] Refund Sends Full Amount Without Deducting Fee

- **File:** `packages/contracts/src/PaymentGatewayV1.sol`, Lines 293-295
- **Description:** The `refund()` function transfers `p.amount` (the original full amount) from the merchant back to the payer. However, during `finalize()`, the merchant only received `p.amount - feeAmount`. The merchant must refund more than they received.
- **Attack Scenario:** A merchant who received 95 tokens (after 5% fee) must approve 100 tokens for refund. The 5 token difference is a loss to the merchant, which may discourage legitimate refunds or create accounting issues.
- **Severity:** Medium
- **Fix:** Either refund only `recipientAmount` (amount minus fee) and separately return the fee from treasury, or store the net amount received by the merchant and refund that.

### 1.2 [Low] Empty `_authorizeUpgrade` Implementation

- **File:** `packages/contracts/src/PaymentGatewayV1.sol`, Line 388
- **Description:** `_authorizeUpgrade` has `onlyOwner` modifier but empty body. While functionally correct (the modifier does the check), the empty body is a code smell that could lead to accidentally removing the modifier in future versions.
- **Severity:** Low
- **Fix:** Add a comment or a require statement inside the body for clarity.

### 1.3 [Low] No Event Emitted on `setEnforceTokenWhitelist`

- **File:** `packages/contracts/src/PaymentGatewayV1.sol`, Line 277
- **Description:** Changing `enforceTokenWhitelist` has no corresponding event, making it harder to track configuration changes off-chain.
- **Severity:** Low
- **Fix:** Add an `EnforceTokenWhitelistChanged(bool oldValue, bool newValue)` event.

### 1.4 [Medium] `finalize()` is Permissionless (Anyone Can Call)

- **File:** `packages/contracts/src/PaymentGatewayV1.sol`, Lines 205-230
- **Description:** `finalize()` only requires a valid server signature—any address can call it. While the server signature is required, if the server signature is leaked (e.g., from the API response or logs), anyone can finalize the payment.
- **Attack Scenario:** An attacker intercepts a finalize signature and front-runs the merchant's finalize transaction.
- **Severity:** Medium (mitigated by signature requirement, but signature leakage is possible)
- **Fix:** Consider restricting `finalize()` to be callable only by the merchant (recipient) or a designated operator address, in addition to signature verification.

---

## 2. API Server (`packages/gateway/src/`)

### 2.1 [Critical] No Rate Limiting on Any Endpoint

- **File:** `packages/gateway/src/index.ts` (entire server setup)
- **Description:** There is zero rate limiting configured on any endpoint. No `@fastify/rate-limit` or equivalent is used anywhere.
- **Attack Scenario:** 
  - Brute-force API key guessing via `/payments` or `/merchant` endpoints
  - DoS attack against the payment creation endpoint, exhausting database resources
  - Spam relay submissions to drain the relayer's gas funds
- **Severity:** Critical
- **Fix:** Install `@fastify/rate-limit` and configure per-route limits. Suggested minimums:
  - Payment creation: 10 req/min per IP
  - Gasless relay: 5 req/min per IP
  - Merchant endpoints: 60 req/min per API key
  - Health/chains: 120 req/min per IP

### 2.2 [Critical] CORS Allows All Origins

- **File:** `packages/gateway/src/index.ts`, Line 173
- **Description:** `cors({ origin: true })` allows requests from **any** origin. The comment says "in development" but this applies to all environments—there's no environment check.
- **Attack Scenario:** A malicious website can make cross-origin requests to the Solo Pay API using a victim's browser session/cookies. Combined with the public-key auth (which relies on Origin header), this undermines the origin validation in `public-auth.middleware.ts`.
- **Severity:** Critical
- **Fix:** 
  ```typescript
  origin: process.env.NODE_ENV === 'production' 
    ? (process.env.ALLOWED_ORIGINS || '').split(',') 
    : true
  ```

### 2.3 [High] Origin Validation Bypass via `x-origin` Header

- **File:** `packages/gateway/src/middleware/public-auth.middleware.ts`, Lines 16-20
- **Description:** The `resolveOrigin()` function accepts `x-origin` as a fallback when `Origin` is not present. The `x-origin` header is **not a standard browser header** and can be freely set by any HTTP client, including `curl` or server-side code.
- **Attack Scenario:** An attacker sets `x-origin: http://trusted-widget.com` in a server-side request, bypassing the origin check entirely. This defeats the entire origin-based access control for public-key endpoints.
- **Severity:** High
- **Fix:** Remove `x-origin` fallback entirely. If Origin is not present (e.g., server-to-server calls), require API key auth instead. The `Origin` header is reliably set by browsers for cross-origin requests.

### 2.4 [High] Single Static `ALLOWED_WIDGET_ORIGIN` for All Merchants

- **File:** `packages/gateway/src/middleware/public-auth.middleware.ts`, Line 10
- **Description:** Origin validation uses a single `ALLOWED_WIDGET_ORIGIN` env var. All merchants must use the same origin. If unset (empty string), origin checking is **completely skipped** for all merchants.
- **Attack Scenario:** In production, if `ALLOWED_WIDGET_ORIGIN` is not configured (easy to miss), any origin can use any merchant's public key to create payments.
- **Severity:** High
- **Fix:** Store allowed origins per-merchant in the database. Make origin validation mandatory (fail-closed) rather than optional (fail-open).

### 2.5 [Medium] API Key Hashing Uses Plain SHA-256 (No Salt)

- **File:** `packages/gateway/src/services/merchant.service.ts`, Lines 30-32
- **Description:** `hashApiKey()` uses `crypto.createHash('sha256').update(apiKey).digest('hex')` without any salt. While API keys have high entropy (unlike passwords), identical API keys would produce identical hashes, and rainbow table attacks are theoretically possible.
- **Severity:** Medium
- **Fix:** Use HMAC-SHA256 with a server-side secret, or add a per-merchant salt:
  ```typescript
  private hashApiKey(apiKey: string, salt: string): string {
    return crypto.createHmac('sha256', salt).update(apiKey).digest('hex');
  }
  ```

### 2.6 [Medium] Webhook Has No HMAC Signature Verification

- **File:** `packages/webhook-manager/src/send.ts`
- **Description:** Webhooks are sent as plain JSON POST requests with no HMAC signature header. Merchants cannot verify that webhook payloads genuinely originated from Solo Pay.
- **Attack Scenario:** An attacker sends fake `payment.confirmed` webhooks to a merchant's webhook URL, causing the merchant to fulfill orders for unpaid payments.
- **Severity:** Medium (depends on merchant implementation, but industry standard is to sign webhooks)
- **Fix:** Add an HMAC-SHA256 signature header:
  ```typescript
  const signature = crypto.createHmac('sha256', merchant.webhook_secret)
    .update(JSON.stringify(body)).digest('hex');
  headers['x-solopay-signature'] = signature;
  ```

### 2.7 [Medium] Server Signature Exposed in Payment Creation Response

- **File:** `packages/gateway/src/routes/payments/create.ts`, Line ~233
- **Description:** The `serverSignature` (EIP-712 payment authorization) is returned directly in the API response. This signature authorizes a specific payment and is meant for the payer to include in the on-chain transaction.
- **Attack Scenario:** If the payment creation response is intercepted (MITM, XSS on merchant site, logging), the signature could be used by anyone to execute the payment with the specified parameters. While the parameters are fixed (amount, recipient, etc.), this could enable front-running.
- **Severity:** Medium (mitigated by parameter binding in signature)
- **Fix:** This is somewhat by design (signature must reach the payer), but ensure signatures have short deadlines and consider adding the payer's address to the signed data.

---

## 3. Gasless/Relayer (`packages/simple-relayer/`)

### 3.1 [High] Relayer Has No Authentication

- **File:** `packages/simple-relayer/src/routes/relay.routes.ts`, `packages/simple-relayer/src/server.ts`
- **Description:** The simple-relayer service has **zero authentication**. All endpoints (`/relay/direct`, `/relay/gasless`, `/relay/status/:txId`) are completely open. Anyone who can reach the service can submit transactions using the relayer's wallet.
- **Attack Scenario:** 
  - **Gas draining:** An attacker submits thousands of forward requests with valid signatures, draining the relayer's ETH balance
  - **Direct relay abuse:** The `/relay/direct` endpoint lets anyone submit arbitrary transactions from the relayer's wallet
  - Even though the relayer is behind Docker networking, the port is exposed (`3002:3001`)
- **Severity:** High
- **Fix:** 
  1. Add API key authentication (the gateway already has `RELAY_API_KEY_<chainId>` env vars but the relayer doesn't check them)
  2. Remove port exposure from docker-compose for production
  3. Add request validation (e.g., only allow `to` addresses that match known forwarder/gateway contracts)

### 3.2 [High] No Nonce Validation Before Relay Submission

- **File:** `packages/simple-relayer/src/services/relay.service.ts`, `submitForwardRequest()` method
- **Description:** The relayer does not verify the nonce in the ForwardRequest against the on-chain nonce before submitting the transaction. It blindly forwards the request to the blockchain.
- **Attack Scenario:**
  - **Replay attack:** While ERC2771Forwarder handles nonce on-chain, submitting stale/invalid nonce requests wastes relayer gas on transactions that will revert
  - **Gas griefing:** An attacker submits many requests with incorrect nonces, each consuming relayer gas when they revert
- **Severity:** High
- **Fix:** Before calling `sendTransaction`, verify `forwardRequest.nonce == forwarder.nonces(forwardRequest.from)` on-chain. Reject mismatched nonces pre-flight.

### 3.3 [Medium] In-Memory Transaction Store (No Persistence)

- **File:** `packages/simple-relayer/src/services/relay.service.ts`, Line 93
- **Description:** `transactions: Map<string, TransactionRecord>` stores all transaction records in memory. On restart, all records are lost. No persistence, no cleanup.
- **Attack Scenario:** Memory exhaustion via submitting many transactions. Also, transaction status queries will fail after restart.
- **Severity:** Medium
- **Fix:** Use Redis or a database for transaction records. Add a TTL/cleanup mechanism.

---

## 4. SDK/Widget (`packages/gateway-sdk/`, `packages/widget-js/`)

### 4.1 [Medium] Widget PostMessage Origin Validation is Correct but One-Way

- **File:** `packages/widget-js/src/utils/widget-launcher.ts`, Lines 82-86
- **Description:** The widget launcher correctly validates `event.origin` against `widgetOrigin` for incoming messages. However, the widget URL is built with payment parameters in query strings including `successUrl` and `failUrl`.
- **Attack Scenario:** If an attacker can modify the `successUrl`/`failUrl` parameters (e.g., via XSS on the merchant page), the user could be redirected to a phishing page after payment.
- **Severity:** Medium
- **Fix:** Validate `successUrl` and `failUrl` against a whitelist of allowed domains on the server side during payment creation.

### 4.2 [Low] Public Key Exposed in Client-Side Code

- **File:** `packages/gateway-sdk/src/client.ts`
- **Description:** The `publicKey` is sent in headers and is inherently exposed in client-side code. This is by design (like Stripe's publishable key), but the current origin validation weakness (2.3, 2.4) means the public key alone could be abused.
- **Severity:** Low (by design, but elevated risk due to weak origin validation)
- **Fix:** Fix origin validation issues (2.3, 2.4) to properly protect public key endpoints.

### 4.3 [Low] URL Validation Accepts `javascript:` URLs

- **File:** `packages/widget-js/src/utils/validators.ts`, `isValidUrl()` function
- **Description:** `new URL(str)` accepts `javascript:alert(1)` as a valid URL. The `successUrl` and `failUrl` fields use this validator.
- **Attack Scenario:** An attacker could set `successUrl: "javascript:alert(document.cookie)"` which, when used in `window.location.href`, would execute JavaScript.
- **Severity:** Low (browsers typically block `javascript:` in location assignments, but behavior varies)
- **Fix:** Validate that URLs start with `https://` or `http://`:
  ```typescript
  function isValidUrl(str: string): boolean {
    try {
      const url = new URL(str);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch { return false; }
  }
  ```

---

## 5. Infrastructure/Configuration

### 5.1 [High] Hardcoded Database Credentials in Docker Compose

- **File:** `docker/docker-compose.yaml`, Multiple locations
- **Description:** MySQL credentials are hardcoded throughout: `MYSQL_ROOT_PASSWORD: pass`, `MYSQL_PASSWORD: pass`, `DATABASE_URL: mysql://solopay:pass@mysql:3306/solopay`. While the `.env.example` exists for some secrets, database credentials are directly in the compose file.
- **Attack Scenario:** If the docker-compose file is deployed to production as-is, the database has trivial credentials (`pass`).
- **Severity:** High (if used in production; acceptable for local development only)
- **Fix:** Move all credentials to `.env` file with strong defaults. Add documentation that production MUST override these values.

### 5.2 [Medium] Hardhat Private Keys in Docker Compose

- **File:** `docker/docker-compose.yaml`, Lines for `simple-relayer` and `gateway`
- **Description:** Hardhat well-known dev account private keys are hardcoded. Comments correctly note these are "safe to commit" for development, but the same compose file structure may be used as a template for production.
- **Severity:** Medium (well-documented as dev-only, but still a risk if copy-pasted)
- **Fix:** Use environment variable references (`${SIGNER_PRIVATE_KEY}`) with `.env` file for all private keys, even in development compose files.

### 5.3 [Low] No Workflow Input Sanitization in CI/CD

- **File:** `.github/workflows/build-push.yml`
- **Description:** The workflow uses `${{ github.ref }}` and `${{ secrets.* }}` safely. However, the Kustomize update step uses `npx prettier` from an uncontrolled source (latest npm version).
- **Severity:** Low
- **Fix:** Pin the prettier version or use a locked dependency.

---

## Summary Table

| # | Severity | Area | Issue |
|---|----------|------|-------|
| 2.1 | **Critical** | Gateway | No rate limiting on any endpoint |
| 2.2 | **Critical** | Gateway | CORS allows all origins in all environments |
| 2.3 | **High** | Gateway | Origin validation bypass via x-origin header |
| 2.4 | **High** | Gateway | Single/optional origin check for all merchants |
| 3.1 | **High** | Relayer | No authentication on relayer service |
| 3.2 | **High** | Relayer | No nonce pre-validation (gas griefing) |
| 5.1 | **High** | Infra | Hardcoded database credentials |
| 1.1 | **Medium** | Contract | Refund amount mismatch (full vs net) |
| 1.4 | **Medium** | Contract | finalize() callable by anyone with signature |
| 2.5 | **Medium** | Gateway | Unsalted SHA-256 for API key hashing |
| 2.6 | **Medium** | Webhook | No HMAC signature on webhooks |
| 2.7 | **Medium** | Gateway | Server signature in API response |
| 3.3 | **Medium** | Relayer | In-memory transaction store |
| 4.1 | **Medium** | Widget | Redirect URL manipulation |
| 5.2 | **Medium** | Infra | Hardhat keys in compose template |
| 1.2 | **Low** | Contract | Empty _authorizeUpgrade body |
| 1.3 | **Low** | Contract | Missing event for whitelist toggle |
| 4.2 | **Low** | SDK | Public key exposure (amplified by weak origin checks) |
| 4.3 | **Low** | Widget | URL validator accepts javascript: protocol |
| 5.3 | **Low** | CI/CD | Unpinned npm dependency in workflow |

---

## Recommended Priority

1. **Immediate (Critical):** Add rate limiting (#2.1), fix CORS configuration (#2.2)
2. **Urgent (High):** Remove `x-origin` bypass (#2.3), per-merchant origin validation (#2.4), relayer authentication (#3.1), nonce pre-validation (#3.2), externalize credentials (#5.1)
3. **Short-term (Medium):** Fix refund amount logic (#1.1), add webhook HMAC (#2.6), persist relayer transactions (#3.3), URL validation (#4.1)
4. **Backlog (Low):** Remaining low-severity items
