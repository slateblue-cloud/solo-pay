/**
 * One-time setup per run: generate N accounts, optionally persist for client, then fund.
 * No cache: each execute:api / execute:client uses fresh accounts for that run only.
 */

import { getNetworkConfig } from '../config';
import { saveAccounts, generateAccounts, fundAccounts, type TestAccount } from './account-manager';

const DEFAULT_COUNT = 10;
/** Default fund for client: must be >= first product (Ethiopia Yirgacheffe). ~1.41 DST on dev → use 2. Use --fund-amount=X to override. */
const DEFAULT_FUND_AMOUNT = '2';

export const DEFAULT_ACCOUNT_COUNT = DEFAULT_COUNT;
export const DEFAULT_FUND_AMOUNT_VALUE = DEFAULT_FUND_AMOUNT;

export interface SetupAccountsOptions {
  /** If true, write accounts to data/accounts.json (needed for client so Playwright workers can read) */
  persist?: boolean;
  onFundProgress?: (current: number, total: number) => void;
}

/**
 * Generate `count` accounts, optionally save to disk (for client), then fund. Always fresh per run.
 */
export async function setupAccountsForRun(
  count: number,
  network: string,
  fundAmount: string = DEFAULT_FUND_AMOUNT,
  options: SetupAccountsOptions = {}
): Promise<TestAccount[]> {
  const config = getNetworkConfig(network);

  console.log(`\n📝 Generating ${count} accounts for ${network}...`);
  const accounts = generateAccounts(count);

  if (options.persist) {
    saveAccounts(accounts, network);
    console.log(`   Saved to data/accounts.json\n`);
  }

  console.log(
    `💰 Funding ${accounts.length} accounts with ${fundAmount} ${config.tokenSymbol} each...`
  );
  await fundAccounts(accounts, config, fundAmount, (p) => {
    options.onFundProgress?.(p.current, p.total);
  });
  console.log('\n✅ Accounts ready.\n');
  return accounts;
}
