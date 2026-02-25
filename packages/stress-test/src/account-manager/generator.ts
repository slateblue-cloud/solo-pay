/**
 * Wallet generator for stress testing
 * Generates deterministic or random wallets
 */

import { Wallet, HDNodeWallet } from 'ethers';

export interface TestAccount {
  index: number;
  address: string;
  privateKey: string;
}

// Default mnemonic for deterministic wallet generation (for testing only!)
const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';

/**
 * Generate wallets deterministically from a mnemonic
 * Uses indices starting from 10 to avoid collision with Hardhat's default accounts (0-9)
 */
export function generateDeterministicAccounts(
  count: number,
  mnemonic: string = DEFAULT_MNEMONIC,
  startIndex: number = 10
): TestAccount[] {
  const accounts: TestAccount[] = [];

  for (let i = 0; i < count; i++) {
    const path = `m/44'/60'/0'/0/${startIndex + i}`;
    const wallet = HDNodeWallet.fromMnemonic(Wallet.fromPhrase(mnemonic).mnemonic!, path);

    accounts.push({
      index: i,
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
  }

  return accounts;
}

/**
 * Generate random wallets (different every time)
 */
export function generateRandomAccounts(count: number): TestAccount[] {
  const accounts: TestAccount[] = [];

  for (let i = 0; i < count; i++) {
    const wallet = Wallet.createRandom();
    accounts.push({
      index: i,
      address: wallet.address,
      privateKey: wallet.privateKey,
    });
  }

  return accounts;
}

/**
 * Generate accounts based on options
 */
export function generateAccounts(
  count: number,
  options: {
    random?: boolean;
    mnemonic?: string;
    startIndex?: number;
  } = {}
): TestAccount[] {
  if (options.random) {
    return generateRandomAccounts(count);
  }
  return generateDeterministicAccounts(count, options.mnemonic, options.startIndex);
}
