/**
 * Blockchain helpers for E2E tests.
 * Uses ethers.js to interact with hardhat node directly (not through browser).
 */

import { ethers, JsonRpcProvider, Wallet, Contract } from 'ethers';
import { HARDHAT_ACCOUNTS, CONTRACT_ADDRESSES, RPC_URL } from './constants';

// Minimal ABIs for test setup
const MOCK_ERC20_ABI = [
  'function mint(address to, uint256 amount) external',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function nonces(address owner) view returns (uint256)',
  'function DOMAIN_SEPARATOR() view returns (bytes32)',
] as const;

const PAYMENT_GATEWAY_ABI = [
  'function isPaymentProcessed(bytes32 paymentId) view returns (bool)',
  'function processedPayments(bytes32 paymentId) view returns (bool)',
] as const;

export function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(RPC_URL);
}

export function getWallet(privateKey: string): Wallet {
  return new Wallet(privateKey, getProvider());
}

export function getTokenContract(signer?: Wallet): Contract {
  return new Contract(CONTRACT_ADDRESSES.mockToken, MOCK_ERC20_ABI, signer ?? getProvider());
}

export function getGatewayContract(): Contract {
  return new Contract(CONTRACT_ADDRESSES.paymentGateway, PAYMENT_GATEWAY_ABI, getProvider());
}

/**
 * Ensure the payer account has enough test tokens.
 * Mints tokens using deployer account if balance is insufficient.
 */
export async function ensurePayerHasTokens(
  minAmount: bigint = ethers.parseUnits('10000', 18)
): Promise<void> {
  const token = getTokenContract();
  const payerAddress = HARDHAT_ACCOUNTS.payer.address;
  const balance: bigint = await token.balanceOf(payerAddress);

  if (balance < minAmount) {
    const deployer = getWallet(HARDHAT_ACCOUNTS.deployer.privateKey);
    const tokenWithSigner = getTokenContract(deployer);
    const tx = await tokenWithSigner.mint(payerAddress, minAmount);
    await tx.wait();
  }
}

/**
 * Approve tokens for the payment gateway (traditional approve, not permit).
 * Used as a fallback or for pre-approval in tests.
 */
export async function approveGateway(amount: bigint = ethers.MaxUint256): Promise<void> {
  const payer = getWallet(HARDHAT_ACCOUNTS.payer.privateKey);
  const token = getTokenContract(payer);
  const tx = await token.approve(CONTRACT_ADDRESSES.paymentGateway, amount);
  await tx.wait();
}

/**
 * Check if a payment has been processed on-chain.
 */
export async function isPaymentProcessed(paymentId: string): Promise<boolean> {
  const gateway = getGatewayContract();
  return gateway.processedPayments(paymentId);
}

export { ethers };
