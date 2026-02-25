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
  funding: {
    method: 'mint' | 'transfer';
    sourcePrivateKey?: string;
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
    funding: {
      method: 'mint',
      // Hardhat account #0 (deployer)
      sourcePrivateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    },
  },
  amoy: {
    name: 'Polygon Amoy Testnet',
    chainId: 80002,
    rpcUrl: process.env.RPC_URL || 'https://rpc-amoy.polygon.technology',
    gatewayUrl: process.env.GATEWAY_URL || 'https://gateway.example.com',
    paymentGatewayAddress: '0x2e1fAFd7d30FD625a546f0221705baE97a925a6C',
    forwarderAddress: '0xE8a3C8e530dddd14e02DA1C81Df6a15f41ad78DE',
    tokenAddress: process.env.TOKEN_ADDRESS || '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    tokenDecimals: 18,
    tokenSymbol: 'SUT',
    merchantPublicKey: process.env.MERCHANT_PUBLIC_KEY || '',
    merchantOrigin: process.env.MERCHANT_ORIGIN || '',
    funding: {
      method: 'transfer',
      sourcePrivateKey: process.env.AMOY_MASTER_PRIVATE_KEY,
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
