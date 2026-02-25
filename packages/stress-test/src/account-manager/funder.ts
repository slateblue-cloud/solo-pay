/**
 * Account funder for stress testing
 * Funds test accounts with tokens via minting or transfer
 */

import { JsonRpcProvider, Wallet, Contract, parseUnits } from 'ethers';
import { NetworkConfig } from '../../config';
import { TestAccount } from './generator';

const ERC20_MINT_ABI = [
  'function mint(address to, uint256 amount) external',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

export interface FundingResult {
  address: string;
  success: boolean;
  txHash?: string;
  error?: string;
}

export interface FundingProgress {
  current: number;
  total: number;
  address: string;
  success: boolean;
}

/**
 * Fund accounts by minting tokens (for local/test networks where we have mint access)
 */
export async function fundByMinting(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  if (!config.funding.sourcePrivateKey) {
    throw new Error('Source private key not configured for minting');
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const minter = new Wallet(config.funding.sourcePrivateKey, provider);
  const token = new Contract(config.tokenAddress, ERC20_MINT_ABI, minter);
  const amount = parseUnits(amountPerAccount, config.tokenDecimals);

  const results: FundingResult[] = [];

  // Get initial nonce for sequential transactions
  let nonce = await provider.getTransactionCount(minter.address);

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    try {
      const tx = await token.mint(account.address, amount, { nonce });
      await tx.wait();

      results.push({
        address: account.address,
        success: true,
        txHash: tx.hash,
      });

      onProgress?.({
        current: i + 1,
        total: accounts.length,
        address: account.address,
        success: true,
      });

      nonce++;
    } catch (error) {
      results.push({
        address: account.address,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      onProgress?.({
        current: i + 1,
        total: accounts.length,
        address: account.address,
        success: false,
      });
    }
  }

  return results;
}

/**
 * Fund accounts by transferring tokens from master wallet
 */
export async function fundByTransfer(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  if (!config.funding.sourcePrivateKey) {
    throw new Error('Source private key not configured for transfer');
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const master = new Wallet(config.funding.sourcePrivateKey, provider);
  const token = new Contract(config.tokenAddress, ERC20_MINT_ABI, master);
  const amount = parseUnits(amountPerAccount, config.tokenDecimals);

  const results: FundingResult[] = [];

  // Get initial nonce for sequential transactions
  let nonce = await provider.getTransactionCount(master.address);

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    try {
      const tx = await token.transfer(account.address, amount, { nonce });
      await tx.wait();

      results.push({
        address: account.address,
        success: true,
        txHash: tx.hash,
      });

      onProgress?.({
        current: i + 1,
        total: accounts.length,
        address: account.address,
        success: true,
      });

      nonce++;
    } catch (error) {
      results.push({
        address: account.address,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      onProgress?.({
        current: i + 1,
        total: accounts.length,
        address: account.address,
        success: false,
      });
    }
  }

  return results;
}

/**
 * Fund accounts using the configured method for the network
 */
export async function fundAccounts(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  if (config.funding.method === 'mint') {
    return fundByMinting(accounts, config, amountPerAccount, onProgress);
  } else {
    return fundByTransfer(accounts, config, amountPerAccount, onProgress);
  }
}

/**
 * Check token balances for accounts
 */
export async function checkBalances(
  accounts: TestAccount[],
  config: NetworkConfig
): Promise<Map<string, bigint>> {
  const provider = new JsonRpcProvider(config.rpcUrl);
  const token = new Contract(config.tokenAddress, ERC20_MINT_ABI, provider);

  const balances = new Map<string, bigint>();

  for (const account of accounts) {
    const balance = await token.balanceOf(account.address);
    balances.set(account.address, balance);
  }

  return balances;
}
