import { parseGwei } from 'viem';

/** Polygon network chain IDs (Mainnet + Amoy testnet) */
export const POLYGON_CHAIN_IDS = [137, 80002]; // Polygon Mainnet, Polygon Amoy

/** Polygon gas config — higher fees required (min 25 gwei priority fee) */
export const POLYGON_GAS_CONFIG = {
  maxPriorityFeePerGas: parseGwei('30'), // 30 gwei (above 25 gwei minimum)
  maxFeePerGas: parseGwei('100'), // 100 gwei max
};

/** Polygon gas config for approve transactions (lower gas limit) */
export const POLYGON_APPROVE_GAS_CONFIG = {
  ...POLYGON_GAS_CONFIG,
  gas: BigInt(100000), // Explicit gas limit for approve (typically ~50k)
};

/** Polygon gas config for payment transactions */
export const POLYGON_PAYMENT_GAS_CONFIG = {
  ...POLYGON_GAS_CONFIG,
  gas: BigInt(300000), // Explicit gas limit to avoid estimation failures
};
