import { http, fallback, createConfig } from 'wagmi';
import { injected, metaMask } from 'wagmi/connectors';
import { arbitrum, base, mainnet, optimism, polygon, polygonAmoy, sepolia } from 'wagmi/chains';
import { defineChain } from 'viem';
import { getTrustWalletProvider } from './lib/wallet-providers';

// Localhost (Hardhat/Anvil) for local dev - so widget can read balance on same chain as payment
const localhost = defineChain({
  id: 31337,
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_LOCALHOST_RPC || 'http://127.0.0.1:8545'],
    },
  },
});

const chains = [
  localhost,
  mainnet,
  polygon,
  polygonAmoy,
  optimism,
  arbitrum,
  base,
  sepolia,
] as const;

export const config = createConfig({
  connectors: [
    // Injected connector for wallet browsers (MetaMask mobile, etc.)
    injected(),
    // Trust Wallet: explicit target; provider from window.trustwallet, ethereum.providers[], or EIP-6963
    injected({
      target() {
        if (typeof window === 'undefined') return undefined;
        const provider = getTrustWalletProvider();
        if (!provider) return undefined;
        return { id: 'trustWallet', name: 'Trust Wallet', provider } as {
          id: string;
          name: string;
          provider: import('viem').EIP1193Provider;
        };
      },
      unstable_shimAsyncInject: 3_500,
    }),
    // MetaMask SDK for desktop extension + mobile deeplink (analytics off to avoid ERR_BLOCKED_BY_CLIENT from ad blockers)
    metaMask({ enableAnalytics: false }),
  ],
  chains,
  transports: {
    [localhost.id]: http(process.env.NEXT_PUBLIC_LOCALHOST_RPC || 'http://127.0.0.1:8545'),
    // Use publicnode RPCs - they have proper CORS headers
    [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
    [polygon.id]: http('https://polygon-bor-rpc.publicnode.com'),
    // Polygon Amoy - use fallback RPCs for reliability
    [polygonAmoy.id]: fallback([
      http('https://polygon-amoy.drpc.org'),
      http('https://polygon-amoy-bor-rpc.publicnode.com'),
      http('https://rpc-amoy.polygon.technology'),
    ]),
    [optimism.id]: http('https://optimism-rpc.publicnode.com'),
    [arbitrum.id]: http('https://arbitrum-one-rpc.publicnode.com'),
    [base.id]: http('https://base-rpc.publicnode.com'),
    [sepolia.id]: http('https://ethereum-sepolia-rpc.publicnode.com'),
  },
  ssr: true,
});
