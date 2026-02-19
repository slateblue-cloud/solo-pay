import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@openzeppelin/hardhat-upgrades';
import * as dotenv from 'dotenv';

dotenv.config();

const PRIVATE_KEY =
  process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000000';

// Etherscan API v2: Single API key for all 60+ supported chains
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      evmVersion: 'paris',
      viaIR: true,
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
      },
    },
    localhost: {
      url: process.env.RPC_URL || 'http://127.0.0.1:8545',
    },
    polygonAmoy: {
      url: 'https://polygon-amoy-bor-rpc.publicnode.com',
      chainId: 80002,
      accounts: [PRIVATE_KEY],
    },
    polygon: {
      url: 'https://polygon-bor-rpc.publicnode.com',
      chainId: 137,
      accounts: [PRIVATE_KEY],
    },
    ethereumSepolia: {
      url: 'https://rpc.sepolia.org',
      chainId: 11155111,
      accounts: [PRIVATE_KEY],
    },
    ethereum: {
      url: 'https://cloudflare-eth.com',
      chainId: 1,
      accounts: [PRIVATE_KEY],
    },
    bnbTestnet: {
      url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
      chainId: 97,
      accounts: [PRIVATE_KEY],
    },
    bnb: {
      url: 'https://bsc-dataseed.binance.org',
      chainId: 56,
      accounts: [PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
    customChains: [
      {
        network: 'amoy',
        chainId: 80002,
        urls: {
          apiURL: 'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com',
        },
      },
    ],
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: 'USD',
  },
  paths: {
    sources: './src',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
  typechain: {
    outDir: 'typechain-types',
    target: 'ethers-v6',
  },
};

export default config;
