import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import {
  ChainModel,
  CurrencyModel,
  TokenModel,
  MerchantModel,
  MerchantUpdateInput,
  MerchantCreateInput,
  TokenUpdateInput,
  TokenCreateInput,
  MerchantPaymentMethodModel,
} from '../src/generated/prisma/internal/prismaNamespace';

/** Prisma MariaDB adapter expects scheme mariadb:// (not mysql://) */
function getDatabaseUrl(): string {
  let url: string;
  if (process.env.DATABASE_URL) {
    url = process.env.DATABASE_URL;
  } else {
    const host = process.env.MYSQL_HOST || 'localhost';
    const port = process.env.MYSQL_PORT || '3306';
    const user = process.env.MYSQL_USER || 'solopay';
    const password = process.env.MYSQL_PASSWORD || '';
    const database = process.env.MYSQL_DATABASE || 'solopay';
    url = `mysql://${user}:${password}@${host}:${port}/${database}`;
  }
  return url.replace(/^mysql:\/\//i, 'mariadb://');
}

const adapter = new PrismaMariaDb(getDatabaseUrl());
const prisma = new PrismaClient({ adapter });

// Chains (7 networks)
// id=1: Localhost (Hardhat/Anvil) - with deployed contracts
// id=2: Sepolia (Ethereum Testnet) - no contracts yet
// id=3: Amoy (Polygon Testnet) - with deployed contracts
// id=4: BNB Chain Testnet - no contracts yet
// id=5: Polygon (Mainnet) - with deployed contracts
// id=6: Ethereum (Mainnet) - no contracts yet
// id=7: BNB Chain (Mainnet) - no contracts yet
const chains: ChainModel[] = [
  {
    id: 1,
    network_id: 31337,
    name: 'Localhost',
    rpc_url: 'http://hardhat-node:8545',
    gateway_address: '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9',
    forwarder_address: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    is_testnet: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 2,
    network_id: 11155111,
    name: 'Sepolia',
    rpc_url: 'https://ethereum-sepolia-rpc.publicnode.com',
    gateway_address: null,
    forwarder_address: null,
    is_testnet: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 3,
    network_id: 80002,
    name: 'Amoy',
    rpc_url: 'https://rpc-amoy.polygon.technology',
    gateway_address: '0x2024b6669A2BE5fF9624792cB1BB657d20C4b24B',
    forwarder_address: '0xE8a3C8e530dddd14e02DA1C81Df6a15f41ad78DE',
    is_testnet: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 4,
    network_id: 97,
    name: 'BNB Chain Testnet',
    rpc_url: 'https://data-seed-prebsc-1-s1.binance.org:8545',
    gateway_address: null,
    forwarder_address: null,
    is_testnet: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 5,
    network_id: 137,
    name: 'Polygon',
    rpc_url: 'https://polygon-rpc.com',
    gateway_address: '0x4F81a1481fc3d6479E2e6d56052fC60539F707ec',
    forwarder_address: '0xec63c3E7BD0c51AA6DC08f587A2B147a671cf888',
    is_testnet: false,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 6,
    network_id: 1,
    name: 'Ethereum',
    rpc_url: 'https://eth.llamarpc.com',
    gateway_address: null,
    forwarder_address: null,
    is_testnet: false,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 7,
    network_id: 56,
    name: 'BNB Chain',
    rpc_url: 'https://bsc-dataseed.binance.org',
    gateway_address: null,
    forwarder_address: null,
    is_testnet: false,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

// Tokens
// id=1: TEST on Localhost (chain_id=1) - MockERC20, no permit
// id=2: SUT on Polygon (chain_id=5) - permit enabled
// id=3: MSQ on Polygon (chain_id=5) - permit enabled
// id=4: SUT on Amoy (chain_id=3) - permit enabled
// id=5: MSQ on Amoy (chain_id=3) - permit enabled
const tokens: TokenModel[] = [
  {
    id: 1,
    chain_id: 1,
    address: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
    symbol: 'TEST',
    decimals: 18,
    cmc_slug: 'msquare-global', // for testing
    permit_enabled: false,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 2,
    chain_id: 5,
    address: '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55',
    symbol: 'SUT',
    decimals: 18,
    cmc_slug: 'supertrust',
    permit_enabled: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 3,
    chain_id: 5,
    address: '0x6A8Ec2d9BfBDD20A7F5A4E89D640F7E7cebA4499',
    symbol: 'MSQ',
    decimals: 18,
    cmc_slug: 'msquare-global',
    permit_enabled: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 3,
    chain_id: 5,
    address: '0x82DbF4227a981211d84f59092889eAdbb9C2a4D2',
    symbol: 'DST',
    decimals: 18,
    cmc_slug: 'daystarter',
    permit_enabled: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 4,
    chain_id: 3,
    address: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    symbol: 'SUT',
    decimals: 18,
    cmc_slug: null,
    permit_enabled: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 5,
    chain_id: 3,
    address: '0x7350C119cb048c2Ea6b2532bcE82c2F7c042ff6b',
    symbol: 'MSQ',
    decimals: 18,
    cmc_slug: null,
    permit_enabled: true,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

// Merchants
// id=1: Demo Store (chain_id=1, Localhost) - API Key: 123
// id=2: Metastar Global (chain_id=3, Amoy) - API Key: msq_sk_metastar_123
// id=3: Sample Merchant (chain_id=1, Localhost) - API Key: sample_api_key_001
const merchants: MerchantModel[] = [
  {
    id: 1,
    merchant_key: 'merchant_demo_001',
    name: 'Demo Store',
    chain_id: 1,
    api_key_hash: 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3',
    public_key: 'pk_test_demo',
    public_key_hash: 'cfaaf44f4fcf9f65805b2a4642a68173d0b427f104dd192adbb489f01e392b76',
    allowed_domains: ['http://localhost:3000'],
    webhook_url: 'http://demo:3000/api/webhook',
    fee_bps: 0,
    recipient_address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 2,
    merchant_key: 'merchant_metastar_001',
    name: 'Metastar Global',
    chain_id: 3,
    api_key_hash: '0136f3e97619f4aa51dffe177e9b7d6bf495ffd6b09547f5463ef483d1db705a',
    public_key: null,
    public_key_hash: null,
    allowed_domains: [],
    webhook_url: null,
    fee_bps: 0,
    recipient_address: '0x7bE4CfF95eb3c3d2162410abCd5506f691C624Ed',
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 3,
    merchant_key: 'merchant_sample_001',
    name: 'Sample Merchant',
    chain_id: 1,
    api_key_hash: '9074171b675d51a53e7524e3b79d1dfa920d72063dcaab734856dd8f97749bd3',
    public_key: 'pk_live_xqKZ6PpVdfUaaVBJhS6qI8RbUbZUbvSq',
    public_key_hash: '05994e195c9cde2a1548d848fa5d40d3506da18d0071785981db25daeb86d4f6',
    allowed_domains: ['http://localhost:3005'],
    webhook_url: 'http://sample-merchant:3004/api/webhook',
    fee_bps: 0,
    recipient_address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

// Payment Methods (merchant_id + token_id pairs)
// Must use tokens from the merchant's chain
const paymentMethods: MerchantPaymentMethodModel[] = [
  {
    id: 1,
    merchant_id: 1,
    token_id: 1,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 2,
    merchant_id: 2,
    token_id: 5,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 3,
    merchant_id: 3,
    token_id: 1,
    is_enabled: true,
    is_deleted: false,
    deleted_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  },
];

// Currencies (10 fiat currencies supported by CoinMarketCap)
const currencies: CurrencyModel[] = [
  {
    id: 1,
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 2,
    code: 'KRW',
    name: 'Korean Won',
    symbol: '₩',
    created_at: new Date(),
    updated_at: new Date(),
  },
  { id: 3, code: 'EUR', name: 'Euro', symbol: '€', created_at: new Date(), updated_at: new Date() },
  {
    id: 4,
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 5,
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 6,
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: '¥',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 7,
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 8,
    code: 'HKD',
    name: 'Hong Kong Dollar',
    symbol: 'HK$',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 9,
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: 10,
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'C$',
    created_at: new Date(),
    updated_at: new Date(),
  },
];

async function main() {
  for (const chain of chains) {
    const { id, network_id, ...data } = chain;
    await prisma.chain.upsert({
      where: { network_id },
      update: data,
      create: { id, network_id, ...data },
    });
  }
  console.log(`Seeded ${chains.length} chains`);

  for (const token of tokens) {
    await prisma.token.upsert({
      where: { id: token.id },
      update: token as TokenUpdateInput,
      create: token as TokenCreateInput,
    });
  }
  console.log(`Seeded ${tokens.length} tokens`);

  for (const merchant of merchants) {
    await prisma.merchant.upsert({
      where: { id: merchant.id },
      update: merchant as MerchantUpdateInput,
      create: merchant as MerchantCreateInput,
    });
  }
  console.log(`Seeded ${merchants.length} merchants`);

  for (const pm of paymentMethods) {
    await prisma.merchantPaymentMethod.upsert({
      where: { merchant_id_token_id: { merchant_id: pm.merchant_id, token_id: pm.token_id } },
      update: {},
      create: pm,
    });
  }
  console.log(`Seeded ${paymentMethods.length} payment methods`);

  for (const currency of currencies) {
    const { id, code, ...data } = currency;
    await prisma.currency.upsert({
      where: { code },
      update: data,
      create: { id, code, ...data },
    });
  }
  console.log(`Seeded ${currencies.length} currencies`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
