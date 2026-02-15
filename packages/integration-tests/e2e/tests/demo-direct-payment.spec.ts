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
import { HARDHAT_ACCOUNTS, DEMO_URL } from '../helpers/constants';
import { ensurePayerHasTokens, approveGateway } from '../helpers/blockchain';

test.describe('Direct Payment (Demo)', () => {
  test.beforeAll(async () => {
    await ensurePayerHasTokens();
  });

  test('complete direct payment for Digital Art Pack (10 TOKEN)', async ({ walletPage }) => {
    // 1. Navigate to demo
    await walletPage.goto(DEMO_URL);
    await walletPage.waitForSelector('text=Solo Pay Demo', { timeout: 15_000 });

    // 2. Connect wallet
    const connectBtn = walletPage.getByTestId('rk-connect-button').first();
    await expect(connectBtn).toBeVisible({ timeout: 15_000 });
    await connectBtn.click();

    // Click MetaMask in RainbowKit modal
    const walletOption = walletPage.getByText(/metamask/i).first();
    if (await walletOption.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await walletOption.click();
    }

    // Wait for connection
    const shortenedAddress = HARDHAT_ACCOUNTS.payer.address.slice(0, 6);
    await expect(walletPage.getByText(new RegExp(shortenedAddress, 'i'))).toBeVisible({
      timeout: 15_000,
    });

    // 3. Click "Buy Now" on first product (Digital Art Pack - 10 TOKEN)
    const buyButtons = walletPage.getByRole('button', { name: /buy now/i });
    await expect(buyButtons.first()).toBeVisible({ timeout: 10_000 });
    await buyButtons.first().click();

    // 4. PaymentModal should open with "Checkout" header
    await expect(walletPage.getByText('Checkout')).toBeVisible({ timeout: 10_000 });
    await expect(walletPage.getByText('Digital Art Pack')).toBeVisible();
    await expect(walletPage.getByText(/10/)).toBeVisible();

    // 5. Wait for server config to load (checkout API call)
    // The modal shows "Loading..." while fetching, then shows Approve/Pay buttons
    // Wait for either Approve or Pay button to appear
    const approveBtn = walletPage.getByRole('button', { name: /approve/i });
    const payBtn = walletPage.getByRole('button', { name: /pay/i });

    // Wait for one of them to be visible
    await expect(approveBtn.or(payBtn)).toBeVisible({ timeout: 30_000 });

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
    await expect(walletPage.getByText('Payment Successful!')).toBeVisible({
      timeout: 60_000,
    });

    // 9. Verify payment details are shown
    await expect(walletPage.getByText('Direct')).toBeVisible();
    await expect(walletPage.getByText(/TX Hash/)).toBeVisible();

    // 10. Close modal
    const doneBtn = walletPage.getByRole('button', { name: /done/i });
    await doneBtn.click();

    // Verify toast appears
    await expect(walletPage.getByText('Payment successful!')).toBeVisible({ timeout: 5_000 });
  });
});
