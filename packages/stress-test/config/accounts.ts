/**
 * Default Hardhat test accounts (indices 3-12)
 * These avoid collision with deployer (#0), relayer (#1), signer (#2)
 */

export interface TestAccount {
  index: number;
  address: string;
  privateKey: string;
}

export const DEFAULT_HARDHAT_ACCOUNTS: TestAccount[] = [
  {
    index: 0,
    address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
    privateKey: '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  },
  {
    index: 1,
    address: '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
    privateKey: '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  },
  {
    index: 2,
    address: '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
    privateKey: '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  },
  {
    index: 3,
    address: '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
    privateKey: '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  },
  {
    index: 4,
    address: '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
    privateKey: '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
  },
  {
    index: 5,
    address: '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
    privateKey: '0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97',
  },
  {
    index: 6,
    address: '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
    privateKey: '0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6',
  },
  {
    index: 7,
    address: '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
    privateKey: '0xf214f2b2cd398c806f84e317254e0f0b801d0643303237d97a22a48e01628897',
  },
  {
    index: 8,
    address: '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
    privateKey: '0x701b615bbdfb9de65240bc28bd21bbc0d996645a3dd57e7b12bc2bdf6f192c82',
  },
  {
    index: 9,
    address: '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',
    privateKey: '0xa267530f49f8280200edf313ee7af6b827f2a8bce2897751d06a843f644967b1',
  },
];

export const MINT_OWNER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
