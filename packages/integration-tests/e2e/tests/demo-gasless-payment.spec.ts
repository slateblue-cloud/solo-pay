/**
 * E2E test: Gasless payment flow on the demo app.
 *
 * Flow:
 * 1. Connect wallet
 * 2. Click "Buy Now" on a product
 * 3. Switch to "Gasless" payment mode
 * 4. Approve token (traditional approve required for gasless too)
 * 5. Click Pay → signs EIP-712 ForwardRequest → submits to relayer
 * 6. Relayer executes meta-transaction on-chain
 * 7. Verify payment success
 *
 * This tests the full gasless flow: approve + EIP-712 signature + relay.
 * The user pays 0 gas — relayer covers it.
 */

import { test, expect } from '../helpers/fixtures';
import { DEMO_URL } from '../helpers/constants';
import { ensurePayerHasTokens } from '../helpers/blockchain';
import { connectWallet } from '../helpers/wallet-connect';

test.describe('Gasless Payment (Demo)', () => {
  test.beforeAll(async () => {
    await ensurePayerHasTokens();
  });

  test('complete gasless payment for Game Credits (25 TOKEN)', async ({ walletPage }) => {
    // 1. Navigate to demo
    await walletPage.goto(DEMO_URL);
    await walletPage.waitForSelector('text=Solo Pay Demo', { timeout: 15_000 });

    // 2. Connect wallet (handles auto-connection from mock provider)
    await connectWallet(walletPage);

    // 3. Click "Buy Now" on third product (Game Credits - 25 TOKEN)
    const buyButtons = walletPage.getByRole('button', { name: /buy now/i });
    await expect(buyButtons.nth(2)).toBeVisible({ timeout: 10_000 });
    await buyButtons.nth(2).click();

    // 4. PaymentModal opens
    await expect(walletPage.getByText('Checkout')).toBeVisible({ timeout: 10_000 });
    await expect(walletPage.getByText('Game Credits').first()).toBeVisible();

    // 5. Switch to Gasless mode (target the button, not background "Gasless Payment:" text)
    const gaslessBtn = walletPage.getByRole('button', { name: /gasless/i });
    await expect(gaslessBtn).toBeVisible({ timeout: 10_000 });
    await gaslessBtn.click();

    // 6. Wait for buttons
    const approveBtn = walletPage.getByRole('button', { name: /^approve\b/i });
    const payBtn = walletPage.getByRole('button', { name: /^pay\s+\d+/i });
    await approveBtn.or(payBtn).first().waitFor({ timeout: 30_000 });

    // 7. Approve if needed (button may appear disabled while loading, then disappear
    //    if allowance is already sufficient from a previous test run)
    if (await approveBtn.isVisible().catch(() => false)) {
      try {
        await expect(approveBtn).toBeEnabled({ timeout: 15_000 });
        await approveBtn.click();
        await expect(approveBtn).not.toBeVisible({ timeout: 30_000 });
      } catch {
        // Approve button disappeared or never became enabled — allowance already sufficient
      }
    }

    // 8. Pay (gasless — signs ForwardRequest, sends to relayer)
    await expect(payBtn).toBeEnabled({ timeout: 15_000 });
    await payBtn.click();

    // 9. Wait for gasless payment to complete
    // Gasless payments take longer due to relay submission + on-chain confirmation
    // Use exact match to avoid strict mode violation with toast ("Payment successful!" lowercase)
    await expect(walletPage.getByText('Payment Successful!', { exact: true })).toBeVisible({
      timeout: 90_000,
    });

    // 10. Verify gasless-specific details
    await expect(walletPage.getByText(/Gasless.*Meta-TX/i)).toBeVisible();
    await expect(walletPage.getByText(/Relayer.*Free/i)).toBeVisible();

    // 11. Close
    const doneBtn = walletPage.getByRole('button', { name: /done/i });
    await doneBtn.click();
  });
});
