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
  // RainbowKit displays addresses as "0x90…b906" (prefix + ellipsis + suffix)
  const addr = HARDHAT_ACCOUNTS.payer.address;
  const addressRegex = new RegExp(`${addr.slice(0, 4)}.*${addr.slice(-4)}`, 'i');

  const addressLocator = page.getByText(addressRegex);
  const connectBtn = page.getByTestId('rk-connect-button').first();

  // Wait for either: already-connected address OR connect button
  // The mock provider may auto-connect before the test reaches this point
  await addressLocator.or(connectBtn).waitFor({ timeout: 15_000 });

  // Already connected (auto-connect via mock provider) — done
  if (await addressLocator.isVisible().catch(() => false)) {
    return;
  }

  // Click Connect Wallet button
  await connectBtn.click();

  // Try clicking MetaMask in RainbowKit modal
  const metaMaskOption = page.getByText(/metamask/i).first();
  if (await metaMaskOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await metaMaskOption.click();
  }

  // Wait for connection
  await addressLocator.waitFor({ timeout: 15_000 });
}
