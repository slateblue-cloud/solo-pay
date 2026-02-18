/**
 * AppKit Wagmi adapter factory. Used by WidgetConfigProvider when projectId (from URL wcProjectId) is set.
 */
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import {
  mainnet,
  polygon,
  polygonAmoy,
  arbitrum,
  optimism,
  base,
  sepolia,
  defineChain,
} from '@reown/appkit/networks';
import { metadata } from './appkit-config';
import { config as fallbackConfig } from './wagmi';
import type { Config } from 'wagmi';

const localhost = defineChain({
  id: 31337,
  caipNetworkId: 'eip155:31337',
  chainNamespace: 'eip155',
  name: 'Localhost',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_LOCALHOST_RPC || 'http://127.0.0.1:8545'],
    },
  },
});

export const appkitNetworks = [
  localhost,
  mainnet,
  polygon,
  polygonAmoy,
  optimism,
  arbitrum,
  base,
  sepolia,
];

export type AppKitConfigResult = { adapter: WagmiAdapter; config: Config };

type WagmiAdapterConfig = ConstructorParameters<typeof WagmiAdapter>[0];

/**
 * Create AppKit Wagmi adapter and config for the given projectId.
 * projectId is passed from WidgetConfigProvider (from URL query wcProjectId).
 */
export function createAppKitConfig(projectId: string): AppKitConfigResult {
  const adapter = new WagmiAdapter({
    projectId,
    networks: appkitNetworks as WagmiAdapterConfig['networks'],
    ssr: true,
    metadata: {
      name: metadata.name,
      description: metadata.description,
      url: metadata.url || 'https://solopay.example',
      icons: metadata.icons,
    },
  } as WagmiAdapterConfig);
  return { adapter, config: adapter.wagmiConfig };
}

export { fallbackConfig };
