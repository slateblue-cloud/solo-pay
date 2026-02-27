/**
 * Account funder for stress testing
 * Funds test accounts with tokens via minting or transfer.
 * Supports optional Multicall3 batching : many mints/transfers in one tx.
 */

import { JsonRpcProvider, Wallet, Contract, Interface, parseUnits } from 'ethers';
import { NetworkConfig } from '../../config';
import { TestAccount } from './generator';

/** Multicall3 is deployed at this address on 250+ EVM chains (incl. Amoy). Not on Hardhat by default. */
export const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

const ERC20_MINT_ABI = [
  'function mint(address to, uint256 amount) external',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
];

const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[] returnData)',
];

/** Max calls per multicall tx to stay under typical gas limit (~30M). One mint/transfer ~50-70k. */
const MULTICALL_BATCH_SIZE = 300;

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
 * Fund accounts via Multicall3: many mints or transfers in one tx per batch.
 */
async function fundByMulticall(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  method: 'mint' | 'transfer',
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  if (!config.funding.sourcePrivateKey) {
    throw new Error(`Source private key not configured for ${method}`);
  }

  const provider = new JsonRpcProvider(config.rpcUrl);
  const signer = new Wallet(config.funding.sourcePrivateKey, provider);
  const amount = parseUnits(amountPerAccount, config.tokenDecimals);
  const iface = new Interface(ERC20_MINT_ABI);
  const multicall = new Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, signer);

  const results: FundingResult[] = [];
  let done = 0;

  for (let start = 0; start < accounts.length; start += MULTICALL_BATCH_SIZE) {
    const chunk = accounts.slice(start, start + MULTICALL_BATCH_SIZE);
    const calls = chunk.map((account) => ({
      target: config.tokenAddress,
      allowFailure: false,
      callData: iface.encodeFunctionData(method, [account.address, amount]),
    }));

    try {
      const tx = await multicall.aggregate3(calls);
      await tx.wait();
      chunk.forEach((account) => {
        results.push({ address: account.address, success: true });
        done++;
        onProgress?.({
          current: done,
          total: accounts.length,
          address: account.address,
          success: true,
        });
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      chunk.forEach((account) => {
        results.push({ address: account.address, success: false, error: msg });
        done++;
        onProgress?.({
          current: done,
          total: accounts.length,
          address: account.address,
          success: false,
        });
      });
    }
  }

  return results;
}

export async function fundByMulticallMinting(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  return fundByMulticall(accounts, config, amountPerAccount, 'mint', onProgress);
}

export async function fundByMulticallTransfer(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  return fundByMulticall(accounts, config, amountPerAccount, 'transfer', onProgress);
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
 * Fund accounts using the configured method for the network.
 * When funding.useMulticall is true, batches many mints/transfers per tx via Multicall3 (no contract change).
 */
export async function fundAccounts(
  accounts: TestAccount[],
  config: NetworkConfig,
  amountPerAccount: string,
  onProgress?: (progress: FundingProgress) => void
): Promise<FundingResult[]> {
  const useMulticall = config.funding.useMulticall === true;
  if (useMulticall) {
    const batches = Math.ceil(accounts.length / MULTICALL_BATCH_SIZE);
    console.log(
      `   (Multicall3: ${accounts.length} accounts → ${batches} tx${batches > 1 ? 's' : ''})\n`
    );
  }

  if (config.funding.method === 'mint') {
    return useMulticall
      ? fundByMulticallMinting(accounts, config, amountPerAccount, onProgress)
      : fundByMinting(accounts, config, amountPerAccount, onProgress);
  } else {
    return useMulticall
      ? fundByMulticallTransfer(accounts, config, amountPerAccount, onProgress)
      : fundByTransfer(accounts, config, amountPerAccount, onProgress);
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
