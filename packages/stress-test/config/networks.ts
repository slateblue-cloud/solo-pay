/**
 * Network configurations for stress testing
 */

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  gatewayUrl: string;
  paymentGatewayAddress: string;
  forwarderAddress: string;
  tokenAddress: string;
  tokenDecimals: number;
  tokenSymbol: string;
  merchantPublicKey: string;
  merchantOrigin: string;
  merchantUrl: string;
  funding: {
    method: 'mint' | 'transfer';
    sourcePrivateKey?: string;
    /** Use Multicall3 to batch many mints/transfers per tx. Saves gas and time for large account counts. Requires Multicall3 at MULTICALL3_ADDRESS (Amoy has it; Hardhat usually does not). */
    useMulticall?: boolean;
  };
}

export const NETWORKS: Record<string, NetworkConfig> = {
  hardhat: {
    name: 'Hardhat Local',
    chainId: 31337,
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
    gatewayUrl: process.env.GATEWAY_URL || 'http://localhost:3001',
    paymentGatewayAddress: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    forwarderAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    tokenAddress: process.env.TOKEN_ADDRESS || '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    tokenDecimals: 18,
    tokenSymbol: 'TEST',
    merchantPublicKey: 'pk_test_demo',
    merchantOrigin: 'http://localhost:3005',
    merchantUrl: process.env.MERCHANT_URL || 'http://localhost:3004',
    funding: {
      method: 'mint',
      sourcePrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      useMulticall: false,
    },
  },
  amoy: {
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    rpcUrl: process.env.RPC_URL || 'https://rpc-amoy.polygon.technology',
    gatewayUrl: process.env.GATEWAY_URL || 'https://gateway-dev.home201.com',
    paymentGatewayAddress: '0x3a88752837ccA9e5195d7175bbc926CB9C14c994',
    forwarderAddress: '0xE8a3C8e530dddd14e02DA1C81Df6a15f41ad78DE',
    tokenAddress: process.env.TOKEN_ADDRESS || '0x54F609AC69E3766a17c055c440A4c24B59e769e1',
    tokenDecimals: 18,
    tokenSymbol: 'DST',
    merchantPublicKey:
      process.env.MERCHANT_PUBLIC_KEY || 'pk_live_xqKZ6PpVdfUaaVBJhS6qI8RbUbZUbvSq',
    merchantOrigin: process.env.MERCHANT_ORIGIN || 'https://widget-dev.home201.com',
    merchantUrl: process.env.MERCHANT_URL || 'https://sample-merchant-dev.home201.com',
    funding: {
      method: 'transfer',
      sourcePrivateKey: process.env.AMOY_MASTER_PRIVATE_KEY,
      useMulticall: true,
    },
  },
};

export function getNetworkConfig(network: string): NetworkConfig {
  const config = NETWORKS[network];
  if (!config) {
    throw new Error(`Unknown network: ${network}. Available: ${Object.keys(NETWORKS).join(', ')}`);
  }
  return config;
}

export function getAvailableNetworks(): string[] {
  return Object.keys(NETWORKS);
}
