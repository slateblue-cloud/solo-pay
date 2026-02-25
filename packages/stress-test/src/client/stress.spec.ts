/**
 * Playwright Client Stress Test
 *
 * Simulates multiple browser users completing payment flows.
 *
 * Usage:
 *   pnpm execute:playwright 3 --headed
 *   WORKERS=5 REPEAT=10 pnpm execute:playwright
 */

import { test, expect, type Page } from '@playwright/test';
import { loadAccounts } from '../account-manager';
import { DEFAULT_HARDHAT_ACCOUNTS, MINT_OWNER } from '../../config/accounts';

const stored = loadAccounts();
const accountsList = stored
  ? stored.accounts.map((a) => ({ address: a.address, privateKey: a.privateKey }))
  : DEFAULT_HARDHAT_ACCOUNTS.map((a) => ({ address: a.address, privateKey: a.privateKey }));

// Configuration
const CONFIG = {
  merchantUrl: process.env.MERCHANT_URL || 'http://localhost:3004',
  rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
  chainId: parseInt(process.env.CHAIN_ID || '31337'),
  tokenAddress: process.env.STRESS_TOKEN_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
  mintOwner: MINT_OWNER,
  mintAmountHex:
    '0x' +
    BigInt(1_000_000 * 1e18)
      .toString(16)
      .padStart(64, '0'),
  accounts: accountsList,
};

// Mock provider script generator
function getMockProviderScript(params: {
  rpcUrl: string;
  privateKey: string;
  address: string;
  chainId: number;
}): string {
  return `
(function() {
  const RPC_URL = ${JSON.stringify(params.rpcUrl)};
  const ADDRESS = ${JSON.stringify(params.address.toLowerCase())};
  const CHAIN_ID = ${JSON.stringify(params.chainId)};
  const CHAIN_ID_HEX = '0x' + CHAIN_ID.toString(16);

  let requestId = 0;

  async function rpcCall(method, params) {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params: params || [] }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
  }

  const listeners = {};

  function emit(event, data) {
    if (listeners[event]) {
      listeners[event].forEach(fn => fn(data));
    }
  }

  const provider = {
    isMetaMask: false,
    isTrustWallet: true,
    isTrust: true,
    isConnected: () => true,
    chainId: CHAIN_ID_HEX,
    networkVersion: String(CHAIN_ID),
    selectedAddress: ADDRESS,

    on(event, fn) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(fn);
      return provider;
    },

    removeListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(f => f !== fn);
      }
      return provider;
    },

    removeAllListeners(event) {
      if (event) delete listeners[event];
      else Object.keys(listeners).forEach(k => delete listeners[k]);
      return provider;
    },

    async request({ method, params }) {
      switch (method) {
        case 'eth_requestAccounts':
          setTimeout(() => {
            emit('connect', { chainId: CHAIN_ID_HEX });
            emit('accountsChanged', [ADDRESS]);
          }, 100);
          return [ADDRESS];
        case 'eth_accounts':
          return [ADDRESS];
        case 'eth_chainId':
          return CHAIN_ID_HEX;
        case 'net_version':
          return String(CHAIN_ID);
        case 'wallet_switchEthereumChain':
        case 'wallet_addEthereumChain':
          return null;
        case 'wallet_requestPermissions':
        case 'wallet_getPermissions':
          return [{ parentCapability: 'eth_accounts' }];
        case 'metamask_getProviderState':
          return {
            isUnlocked: true,
            chainId: CHAIN_ID_HEX,
            networkVersion: String(CHAIN_ID),
            accounts: [ADDRESS],
          };
        case 'eth_signTypedData_v4': {
          const [signerAddress, typedData] = params;
          return rpcCall('eth_signTypedData_v4', [signerAddress, typedData]);
        }
        case 'personal_sign': {
          const [message, signerAddress] = params;
          return rpcCall('personal_sign', [message, signerAddress]);
        }
        case 'eth_sendTransaction': {
          const [tx] = params;
          return rpcCall('eth_sendTransaction', [{ ...tx, from: tx.from || ADDRESS }]);
        }
        default:
          return rpcCall(method, params || []);
      }
    },

    enable() { return Promise.resolve([ADDRESS]); },
    send(method, params) {
      return provider.request({ method, params });
    },
  };

  Object.defineProperty(window, 'ethereum', {
    value: provider,
    writable: false,
    configurable: true,
  });

  window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({
      info: {
        uuid: 'stress-test-wallet',
        name: 'Stress Test Wallet',
        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
        rdns: 'com.trustwallet.app',
      },
      provider,
    }),
  }));

  window.__E2E_TEST__ = true;
})();
`;
}

// Impersonate account on hardhat
async function impersonateAccount(address: string): Promise<void> {
  await fetch(CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'hardhat_impersonateAccount',
      params: [address],
    }),
  });
}

async function rpc(method: string, params: unknown[] | Record<string, unknown>): Promise<unknown> {
  const res = await fetch(CONFIG.rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1e9),
      method,
      params: Array.isArray(params) ? params : [params],
    }),
  });
  const json = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`RPC ${method}: ${json.error.message}`);
  return json.result;
}

/** Mint test tokens to an address via Hardhat RPC (owner = Hardhat #0). */
async function mintTokensToAccount(toAddress: string): Promise<void> {
  const addr = toAddress.startsWith('0x')
    ? toAddress.slice(2).toLowerCase()
    : toAddress.toLowerCase();
  const data =
    '0x40c10f19' + addr.padStart(64, '0') + CONFIG.mintAmountHex.slice(2).padStart(64, '0');
  await rpc('hardhat_impersonateAccount', [CONFIG.mintOwner]);
  try {
    await rpc('eth_sendTransaction', [
      {
        from: CONFIG.mintOwner,
        to: CONFIG.tokenAddress,
        data,
        gas: '0x30d40',
      },
    ]);
  } finally {
    await rpc('hardhat_stopImpersonatingAccount', [CONFIG.mintOwner]);
  }
}

// Single payment flow: sample-merchant (Order) → widget popup (connect, approve, pay)
async function completePayment(
  page: Page,
  productIndex: number = 0
): Promise<{
  success: boolean;
  duration: number;
  error?: string;
}> {
  const startTime = Date.now();
  const url = CONFIG.merchantUrl;
  if (!url || typeof url !== 'string') {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: 'MERCHANT_URL is not set (expected string)',
    };
  }

  try {
    // Navigate to sample-merchant
    await page.goto(url);
    await page.waitForSelector('text=Solo Roasters', { timeout: 15000 });

    // Click Order on product (opens widget popup). Each worker has its own context → one new page = this test's widget window.
    const orderButtons = page.getByRole('button', { name: /^order$/i });
    await expect(orderButtons.nth(productIndex)).toBeVisible({ timeout: 10000 });

    const context = page.context();
    const pagesBeforeClick = new Set(context.pages());
    const popupPromise = context.waitForEvent('page');
    await orderButtons.nth(productIndex).click();
    const popup = await popupPromise;
    if (pagesBeforeClick.has(popup)) {
      throw new Error('New page is not the widget popup (same as existing page).');
    }

    await popup.waitForURL(/3005|\/pc\?/, { timeout: 20000 });
    await popup.waitForLoadState('domcontentloaded');
    await popup.waitForLoadState('load').catch(() => {});

    // Wait for widget to finish initializing - either shows connect wallet OR goes directly to confirm
    const initializing = popup.getByText(/initializing payment/i);
    await initializing.waitFor({ state: 'hidden', timeout: 45000 }).catch(() => {});

    // Check which state we're in: connect wallet OR already at confirm payment (auto-connected)
    const connectHeading = popup.getByRole('heading', { name: /connect wallet/i });
    const trustWalletBtn = popup.getByRole('button', { name: /trust wallet/i });
    const confirmHeadingCheck = popup.getByRole('heading', { name: /confirm payment/i });

    // Wait for any of these states with a race
    const state = await Promise.race([
      connectHeading.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'connect' as const),
      trustWalletBtn.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'connect' as const),
      confirmHeadingCheck
        .waitFor({ state: 'visible', timeout: 30000 })
        .then(() => 'confirm' as const),
    ]).catch(() => 'timeout' as const);

    if (state === 'timeout') {
      throw new Error('Widget did not reach connect wallet or confirm payment state');
    }

    // If we're at connect wallet, click Trust Wallet to connect
    if (state === 'connect') {
      await trustWalletBtn.waitFor({ state: 'visible', timeout: 10000 });
      await trustWalletBtn.click();
    }
    // If state === 'confirm', wallet auto-connected, skip to payment

    // Token uses permit: after connect we go straight to Confirm Payment (no approval step).
    const confirmHeading = popup.getByRole('heading', { name: /confirm payment/i });
    const insufficientMsg = popup.getByText(/insufficient balance/i);
    await Promise.race([
      confirmHeading.waitFor({ state: 'visible', timeout: 45000 }),
      insufficientMsg.waitFor({ state: 'visible', timeout: 45000 }).then(() => {
        throw new Error(
          'Widget shows "Insufficient balance". Mint tokens to stress-test accounts (beforeAll or set STRESS_TOKEN_ADDRESS).'
        );
      }),
    ]);
    if (await insufficientMsg.isVisible().catch(() => false)) {
      throw new Error('Widget shows "Insufficient balance". Mint tokens to stress-test accounts.');
    }
    const payBtn = popup.getByRole('button', { name: 'Pay Now' });
    await expect(payBtn).toBeVisible({ timeout: 15000 });
    await expect(payBtn).toBeEnabled({ timeout: 10000 });
    await payBtn.scrollIntoViewIfNeeded();
    // Click: try normal click first, fallback to JS click if element is covered (e.g. overlay)
    try {
      await payBtn.click({ timeout: 10000, force: true });
    } catch {
      await payBtn.evaluate((el) => (el as { click(): void }).click());
    }

    // Wait for success OR error - fail fast on error instead of waiting 60s
    const successHeading = popup.getByRole('heading', { name: /payment complete/i });
    const paymentError = popup.getByText('Payment Error');
    const txFailed = popup.getByText('Transaction Failed');

    const outcome = await Promise.race([
      successHeading.waitFor({ state: 'visible', timeout: 60000 }).then(() => 'success' as const),
      paymentError
        .waitFor({ state: 'visible', timeout: 60000 })
        .then(() => 'payment_error' as const),
      txFailed.waitFor({ state: 'visible', timeout: 60000 }).then(() => 'tx_failed' as const),
    ]);

    if (outcome !== 'success') {
      // Capture the actual error message from the widget
      let errorDetail = outcome === 'payment_error' ? 'Payment Error' : 'Transaction Failed';
      try {
        const errorMsgEl =
          outcome === 'payment_error'
            ? popup.locator('p.text-gray-600').first()
            : popup.locator('p.text-red-600').first();
        const msgText = await errorMsgEl.textContent({ timeout: 3000 });
        if (msgText) errorDetail += `: ${msgText}`;
      } catch {
        // Could not read error detail, use generic message
      }
      throw new Error(errorDetail);
    }

    // Confirm to close
    const confirmBtn = popup.getByRole('button', { name: /^confirm$/i });
    if (await confirmBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    return {
      success: true,
      duration: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
}

// Test configuration - use serial within describe but parallel across workers
test.describe.configure({ mode: 'parallel' });

// Track which accounts have been minted in this worker process
const mintedAccounts = new Set<string>();

async function ensureAccountMinted(address: string): Promise<void> {
  if (mintedAccounts.has(address)) return;
  await mintTokensToAccount(address);
  mintedAccounts.add(address);
}

// Generate test cases
const REPEAT = parseInt(process.env.REPEAT || '5');
const WORKERS = parseInt(process.env.WORKERS || '3');

for (let i = 0; i < REPEAT; i++) {
  test(`Payment flow iteration ${i + 1}`, async ({ page }, testInfo) => {
    // Use parallelIndex for unique account assignment across all parallel tests
    const workerIndex = testInfo.workerIndex;
    const parallelIndex = testInfo.parallelIndex;

    // Use the test's unique index (i) to ensure each test gets a different account
    const accountIndex = i % CONFIG.accounts.length;
    const account = CONFIG.accounts[accountIndex];

    console.log(
      `[Worker ${workerIndex}][Parallel ${parallelIndex}] Iteration ${i + 1} using account ${account.address.slice(0, 10)}...`
    );

    // Mint tokens for this test's account if not already done
    await ensureAccountMinted(account.address);

    // Stagger to avoid overwhelming relayer (2000ms per worker)
    // Required because simple-relayer doesn't have optimistic nonce management
    // Tests still run faster than sequential (parallel with offset)
    // const staggerDelay = workerIndex * 2000;
    // if (staggerDelay > 0) {
    //   await new Promise((r) => setTimeout(r, staggerDelay));
    // }

    // Inject mock provider
    const script = getMockProviderScript({
      rpcUrl: CONFIG.rpcUrl,
      privateKey: account.privateKey,
      address: account.address,
      chainId: CONFIG.chainId,
    });
    await page.context().addInitScript({ content: script });

    // Run payment flow - use different products to avoid conflicts
    const productIndex = i % 3;
    const result = await completePayment(page, productIndex);

    // Log result for this test
    if (!result.success) {
      console.log(`[Worker ${workerIndex}] Iteration ${i + 1} FAILED: ${result.error}`);
    } else {
      console.log(`[Worker ${workerIndex}] Iteration ${i + 1} completed in ${result.duration}ms`);
    }

    // Assert success
    expect(result.success, result.error).toBe(true);
  });
}
