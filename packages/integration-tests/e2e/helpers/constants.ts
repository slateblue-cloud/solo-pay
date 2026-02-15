/**
 * Test constants — mirrors integration-tests/src/setup/wallets.ts
 */

export const HARDHAT_ACCOUNTS = {
  deployer: {
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const,
    privateKey: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const,
  },
  recipient: {
    address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8' as const,
    privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d' as const,
  },
  relayer: {
    address: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const,
    privateKey: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a' as const,
  },
  payer: {
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const,
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6' as const,
  },
  signer: {
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65' as const,
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a' as const,
  },
  treasury: {
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc' as const,
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const,
  },
} as const;

export const CONTRACT_ADDRESSES = {
  forwarder: '0x5FbDB2315678afecb367f032d93F642f64180aa3' as const,
  mockToken: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512' as const,
  paymentGateway: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9' as const,
} as const;

export const TEST_CHAIN_ID = 31337;
export const RPC_URL = 'http://localhost:8545';
export const DEMO_URL = 'http://localhost:3000';
export const MERCHANT_URL = 'http://localhost:3004';
export const GATEWAY_URL = 'http://localhost:3001';
