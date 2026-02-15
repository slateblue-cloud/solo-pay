/**
 * Playwright test fixtures with mock wallet injection.
 */

import { test as base, type Page } from '@playwright/test';
import { getMockProviderScript } from './mock-ethereum-provider';
import { HARDHAT_ACCOUNTS, TEST_CHAIN_ID, RPC_URL } from './constants';
import { ensurePayerHasTokens, approveGateway } from './blockchain';

/**
 * Extended test fixtures that inject the mock ethereum provider.
 */
export const test = base.extend<{
  /** Page with mock wallet (payer account #3) already injected */
  walletPage: Page;
}>({
  walletPage: async ({ page }, use) => {
    // Impersonate the payer account on hardhat so eth_signTypedData_v4 works
    const rpcUrl = RPC_URL;
    const payerAddress = HARDHAT_ACCOUNTS.payer.address;

    // Impersonate account on hardhat node
    await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'hardhat_impersonateAccount',
        params: [payerAddress],
      }),
    });

    // Inject mock provider before page loads
    const script = getMockProviderScript({
      rpcUrl,
      privateKey: HARDHAT_ACCOUNTS.payer.privateKey,
      address: payerAddress,
      chainId: TEST_CHAIN_ID,
    });
    await page.addInitScript({ content: script });

    await use(page);

    // Stop impersonating
    await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'hardhat_stopImpersonatingAccount',
        params: [payerAddress],
      }),
    });
  },
});

export { expect } from '@playwright/test';

/**
 * Global setup: ensure test tokens are minted
 */
export async function globalSetup(): Promise<void> {
  await ensurePayerHasTokens();
}
