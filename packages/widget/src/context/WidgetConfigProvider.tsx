'use client';

/**
 * Wraps index (/) only. When NEXT_PUBLIC_WC_PROJECT_ID is set → AppKit (WalletConnect); else fallback wagmi (injected + MetaMask SDK).
 * Analytics/telemetry disabled (features.analytics, enableCoinbase: false). Blocked third-party requests (e.g. pulse) are harmless.
 */
import { createElement, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { createAppKit } from '@reown/appkit/react';
import { mainnet } from '@reown/appkit/networks';
import { createAppKitConfig, fallbackConfig, appkitNetworks } from '../appkit-wagmi';
import { getMetadata, APPKIT_WALLET_IDS } from '../appkit-config';
import { AppKitConnectProvider as AppKitConnectProviderComponent } from './AppKitConnectContext';

type CreateAppKitOptions = Parameters<typeof createAppKit>[0];

/** WalletConnect project ID from env (NEXT_PUBLIC_WC_PROJECT_ID). Required for AppKit connect. */
function getWcProjectIdFromEnv(): string | undefined {
  const id = process.env.NEXT_PUBLIC_WC_PROJECT_ID;
  return id && typeof id === 'string' && id.length > 0 ? id : undefined;
}

export default function WidgetConfigProvider({ children }: { children: ReactNode }) {
  const projectId = getWcProjectIdFromEnv();
  const appKitInitialized = useRef(false);

  const { config, adapter } = useMemo(() => {
    if (!projectId) return { config: fallbackConfig, adapter: null };
    const result = createAppKitConfig(projectId);
    return { config: result.config, adapter: result.adapter };
  }, [projectId]);

  useEffect(() => {
    if (!adapter || !projectId || appKitInitialized.current) return;
    appKitInitialized.current = true;
    const meta = getMetadata();
    createAppKit({
      adapters: [adapter],
      projectId,
      networks: appkitNetworks,
      defaultNetwork: mainnet,
      metadata: {
        name: meta.name,
        description: meta.description,
        url: meta.url,
        icons: meta.icons,
      },
      featuredWalletIds: [...APPKIT_WALLET_IDS],
      includeWalletIds: [...APPKIT_WALLET_IDS],
      allWallets: 'HIDE',
      enableCoinbase: false,
      features: {
        analytics: false,
        swaps: false,
        onramp: false,
        socials: false,
        connectMethodsOrder: ['wallet'],
      },
      themeMode: 'light',
      themeVariables: {
        '--apkt-accent': '#2563eb', // blue-600, align with connect button styling
        '--apkt-border-radius-master': '12px',
      },
    } as unknown as CreateAppKitOptions);
  }, [adapter, projectId]);

  const useAppKit = adapter !== null;
  return createElement(
    AppKitConnectProviderComponent,
    { useAppKit },
    createElement(WagmiProvider, { config, reconnectOnMount: false }, children)
  ) as any;
}
