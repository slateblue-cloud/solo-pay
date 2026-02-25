/**
 * Client (Playwright) Stress Test Configuration
 * Loads accounts from shared storage or uses default Hardhat accounts
 */

import { loadAccounts, generateDeterministicAccounts, type TestAccount } from '../account-manager';
import { getNetworkConfig } from '../../config';
import { DEFAULT_HARDHAT_ACCOUNTS, MINT_OWNER } from '../../config/accounts';

export interface ClientConfig {
  merchantUrl: string;
  rpcUrl: string;
  chainId: number;
  tokenAddress: string;
  accounts: TestAccount[];
}

/**
 * Get configuration for client (Playwright) tests
 * Tries to load from shared accounts.json, falls back to default Hardhat accounts
 */
export function getClientConfig(): ClientConfig {
  const network = process.env.NETWORK || 'hardhat';
  const networkConfig = getNetworkConfig(network);

  // Try to load shared accounts
  let accounts: TestAccount[];
  const stored = loadAccounts();

  if (stored && stored.network === network) {
    accounts = stored.accounts;
    console.log(`[Client] Using ${accounts.length} accounts from shared storage`);
  } else if (network === 'hardhat') {
    accounts = DEFAULT_HARDHAT_ACCOUNTS;
    console.log(`[Client] Using ${accounts.length} default Hardhat accounts`);
  } else {
    // Generate deterministic accounts for non-hardhat networks
    accounts = generateDeterministicAccounts(10);
    console.log(`[Client] Generated ${accounts.length} deterministic accounts`);
  }

  return {
    merchantUrl: process.env.MERCHANT_URL || 'http://localhost:3004',
    rpcUrl: networkConfig.rpcUrl,
    chainId: networkConfig.chainId,
    tokenAddress: networkConfig.tokenAddress,
    accounts,
  };
}

export { MINT_OWNER };
