/**
 * Playwright global setup — runs once before all tests.
 * Ensures hardhat node has test tokens minted for the payer account.
 */

import { ensurePayerHasTokens } from './helpers/blockchain';

async function globalSetup(): Promise<void> {
  console.log('[GlobalSetup] Ensuring payer has test tokens...');
  await ensurePayerHasTokens();
  console.log('[GlobalSetup] Done.');
}

export default globalSetup;
