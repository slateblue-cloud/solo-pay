/**
 * Test wallet connection via mock provider injection.
 * Verifies RainbowKit detects the injected wallet and connects.
 */

import { test, expect } from '../helpers/fixtures';
import { HARDHAT_ACCOUNTS, DEMO_URL } from '../helpers/constants';
import { connectWallet } from '../helpers/wallet-connect';

test.describe('Wallet Connection (Demo)', () => {
  test('mock provider is injected and detectable', async ({ walletPage }) => {
    await walletPage.goto(DEMO_URL);

    // Verify mock provider is injected
    const hasEthereum = await walletPage.evaluate(() => !!window.ethereum);
    expect(hasEthereum).toBe(true);

    const isMetaMask = await walletPage.evaluate(() => window.ethereum?.isMetaMask);
    expect(isMetaMask).toBe(true);
  });

  test('can connect wallet via RainbowKit', async ({ walletPage }) => {
    await walletPage.goto(DEMO_URL);
    await walletPage.waitForSelector('text=Solo Pay Demo', { timeout: 15_000 });

    await connectWallet(walletPage);

    // Verify address is shown (RainbowKit: "0x90…b906" format)
    const addr = HARDHAT_ACCOUNTS.payer.address;
    const addrRegex = new RegExp(`${addr.slice(0, 4)}.*${addr.slice(-4)}`, 'i');
    await expect(walletPage.getByText(addrRegex)).toBeVisible();
  });
});
