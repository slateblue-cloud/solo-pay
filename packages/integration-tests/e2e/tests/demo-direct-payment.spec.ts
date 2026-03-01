/**
 * E2E test: Direct payment flow on the demo app.
 *
 * Flow:
 * 1. Connect wallet
 * 2. Click "Buy Now" on a product
 * 3. PaymentModal opens → checkout API creates payment
 * 4. Approve token (if needed)
 * 5. Pay → calls PaymentGateway.pay() on-chain
 * 6. Verify payment success
 *
 * NOTE: This test uses traditional approve flow (not permit).
 * The demo's PaymentModal currently uses approve + pay (not permit).
 */

import { test, expect } from '../helpers/fixtures';
import { DEMO_URL } from '../helpers/constants';
import { ensurePayerHasTokens } from '../helpers/blockchain';
import { connectWallet } from '../helpers/wallet-connect';

test.describe('Direct Payment (Demo)', () => {
  test.beforeAll(async () => {
    await ensurePayerHasTokens();
  });

  test('complete direct payment for Digital Art Pack (10 TOKEN)', async ({ walletPage }) => {
    // 1. Navigate to demo
    await walletPage.goto(DEMO_URL);
    await walletPage.waitForSelector('text=Solo Pay Demo', { timeout: 15_000 });

    // 2. Connect wallet (handles auto-connection from mock provider)
    await connectWallet(walletPage);

    // 3. Click "Buy Now" on first product (Digital Art Pack - 10 TOKEN)
    const buyButtons = walletPage.getByRole('button', { name: /buy now/i });
    await expect(buyButtons.first()).toBeVisible({ timeout: 10_000 });
    await buyButtons.first().click();

    // 4. PaymentModal should open with "Checkout" header
    await expect(walletPage.getByText('Checkout')).toBeVisible({ timeout: 10_000 });
    await expect(walletPage.getByText('Digital Art Pack').first()).toBeVisible();
    await expect(walletPage.getByText('10 TOKEN').first()).toBeVisible();

    // 5. Wait for server config to load (checkout API call)
    // The modal shows "Loading..." while fetching, then shows Approve/Pay buttons
    const approveBtn = walletPage.getByRole('button', { name: /^approve\b/i });
    const payBtn = walletPage.getByRole('button', { name: /^pay\s+\d+/i });

    // Wait for modal to fully load (either button becomes visible)
    await approveBtn.or(payBtn).first().waitFor({ timeout: 30_000 });

    // 6. If Approve is needed, click it
    if (await approveBtn.isVisible().catch(() => false)) {
      await approveBtn.click();
      // Wait for approval TX to confirm
      await expect(approveBtn).not.toBeVisible({ timeout: 30_000 });
    }

    // 7. Click Pay
    await expect(payBtn).toBeEnabled({ timeout: 15_000 });
    await payBtn.click();

    // 8. Wait for payment to complete — "Payment Successful!" should appear
    // Use exact match to avoid strict mode violation with toast ("Payment successful!" lowercase)
    await expect(walletPage.getByText('Payment Successful!', { exact: true })).toBeVisible({
      timeout: 60_000,
    });

    // 9. Verify payment details are shown
    await expect(walletPage.getByText('Direct', { exact: true })).toBeVisible();
    await expect(walletPage.getByText(/TX Hash/)).toBeVisible();

    // 10. Close modal
    const doneBtn = walletPage.getByRole('button', { name: /done/i });
    await doneBtn.click();

    // Verify toast appears
    await expect(walletPage.getByText('Payment successful!')).toBeVisible({ timeout: 5_000 });
  });
});
