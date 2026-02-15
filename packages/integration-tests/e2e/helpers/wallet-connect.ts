/**
 * Helper to connect wallet in the demo app.
 *
 * Strategy: Click RainbowKit connect → click MetaMask → wait for connection.
 * If the standard flow times out, try programmatic connection via page.evaluate.
 */

import type { Page } from '@playwright/test';
import { HARDHAT_ACCOUNTS } from './constants';

/**
 * Connect the mock wallet via RainbowKit UI.
 * Falls back to programmatic connection if UI flow stalls.
 */
export async function connectWallet(page: Page): Promise<void> {
  const shortenedAddress = HARDHAT_ACCOUNTS.payer.address.slice(0, 6);
  const addressRegex = new RegExp(shortenedAddress, 'i');

  // Check if already connected
  if (
    await page
      .getByText(addressRegex)
      .isVisible({ timeout: 2_000 })
      .catch(() => false)
  ) {
    return;
  }

  // Click Connect Wallet button
  const connectBtn = page.getByTestId('rk-connect-button').first();
  await connectBtn.click();

  // Wait for RainbowKit modal
  await page.waitForTimeout(1_000);

  // Try clicking MetaMask
  const metaMaskOption = page.getByText(/metamask/i).first();
  if (await metaMaskOption.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await metaMaskOption.click();
  }

  // Wait for connection with shorter timeout
  const connected = await page
    .getByText(addressRegex)
    .isVisible({ timeout: 10_000 })
    .catch(() => false);

  if (connected) return;

  // Fallback: programmatic connection via wagmi store
  // wagmi stores its state in the global scope, accessible via React internals
  await page.evaluate(async () => {
    // Try to find wagmi's connector and connect programmatically
    const ethereum = window.ethereum;
    if (!ethereum) throw new Error('No ethereum provider');

    // Force trigger eth_requestAccounts
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    console.log('[WalletConnect] Programmatic accounts:', accounts);

    // Dispatch events that wagmi listens to
    if (ethereum.emit) {
      (ethereum as unknown as { emit: (event: string, data: unknown) => void }).emit(
        'accountsChanged',
        accounts
      );
      (ethereum as unknown as { emit: (event: string, data: unknown) => void }).emit('connect', {
        chainId: '0x7a69',
      });
    }
  });

  // Close any open modal
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2_000);

  // If still not connected, try refreshing the page
  // Sometimes wagmi persists connection state, so reloading reconnects
  if (
    !(await page
      .getByText(addressRegex)
      .isVisible({ timeout: 3_000 })
      .catch(() => false))
  ) {
    // Last resort: use wagmi's reconnect behavior
    // wagmi stores connector state in localStorage
    // Set it manually then reload
    await page.evaluate((address) => {
      // wagmi v2 stores state under 'wagmi.store' in localStorage
      const state = {
        state: {
          connections: {
            __type: 'Map',
            value: [
              [
                'injected',
                {
                  accounts: [address],
                  chainId: 31337,
                },
              ],
            ],
          },
          current: 'injected',
          status: 'connected',
        },
        version: 2,
      };
      localStorage.setItem('wagmi.store', JSON.stringify(state));

      // Also set recentConnectorId
      localStorage.setItem('wagmi.recentConnectorId', '"injected"');
    }, HARDHAT_ACCOUNTS.payer.address);

    await page.reload();
    await page.waitForTimeout(3_000);
  }

  // Final check
  await page.getByText(addressRegex).waitFor({ timeout: 15_000 });
}
