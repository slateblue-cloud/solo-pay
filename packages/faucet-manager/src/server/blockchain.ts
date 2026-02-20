import { createPublicClient, http, defineChain, type Address, type PublicClient } from 'viem';
import type { PrismaClient } from '@solo-pay/database';

const ERC20_ABI = [
  {
    type: 'function' as const,
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
  {
    type: 'function' as const,
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view' as const,
  },
] as const;

interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  gatewayAddress: string;
}

export function createBlockchainService(prisma: PrismaClient) {
  const clients = new Map<number, PublicClient>();
  const configs = new Map<number, ChainConfig>();

  async function loadChains(): Promise<void> {
    const chains = await prisma.chain.findMany({
      where: {
        is_deleted: false,
        gateway_address: { not: null },
      },
    });

    for (const c of chains) {
      if (!c.gateway_address) continue;
      const chain = defineChain({
        id: c.network_id,
        name: c.name,
        nativeCurrency: { name: 'Native', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [c.rpc_url] } },
      });
      const client = createPublicClient({
        chain,
        transport: http(c.rpc_url),
      });
      clients.set(c.network_id, client);
      configs.set(c.network_id, {
        chainId: c.network_id,
        name: c.name,
        rpcUrl: c.rpc_url,
        gatewayAddress: c.gateway_address,
      });
    }
  }

  function getConfig(chainId: number): ChainConfig {
    const c = configs.get(chainId);
    if (!c) throw new Error(`Unsupported chain: ${chainId}`);
    return c;
  }

  function getClient(chainId: number): PublicClient {
    const client = clients.get(chainId);
    if (!client) throw new Error(`Unsupported chain: ${chainId}`);
    return client;
  }

  return {
    loadChains,
    isChainSupported: (chainId: number) => clients.has(chainId),
    getChainConfig: getConfig,
    getTokenAllowance: async (
      chainId: number,
      tokenAddress: string,
      owner: string,
      spender: string
    ): Promise<string> => {
      const client = getClient(chainId);
      const result = await client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [owner as Address, spender as Address],
      });
      return result.toString();
    },
    getTokenBalance: async (
      chainId: number,
      tokenAddress: string,
      address: string
    ): Promise<string> => {
      const client = getClient(chainId);
      const result = await client.readContract({
        address: tokenAddress as Address,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as Address],
      });
      return result.toString();
    },
    getNativeBalance: async (chainId: number, address: string): Promise<bigint> => {
      const client = getClient(chainId);
      return client.getBalance({ address: address as Address });
    },
    getGasPrice: async (chainId: number): Promise<bigint> => {
      const client = getClient(chainId);
      return client.getGasPrice();
    },
  };
}
