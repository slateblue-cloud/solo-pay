'use client';

/**
 * Wraps index (/) only. When wcProjectId in URL → AppKit (WalletConnect); else fallback wagmi (injected + MetaMask SDK).
 * Analytics/telemetry disabled (features.analytics, enableCoinbase: false). Blocked third-party requests (e.g. pulse) are harmless.
 */
import { useRouter } from 'next/router';
import { createElement, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { createAppKit } from '@reown/appkit/react';
import { mainnet } from '@reown/appkit/networks';
import { createAppKitConfig, fallbackConfig, appkitNetworks } from '../appkit-wagmi';
import { getMetadata, APPKIT_WALLET_IDS } from '../appkit-config';
import { AppKitConnectProvider as AppKitConnectProviderComponent } from './AppKitConnectContext';

type CreateAppKitOptions = Parameters<typeof createAppKit>[0];

function getWcProjectIdFromUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const params = new URLSearchParams(window.location.search);
  const id = params.get('wcProjectId');
  return id && typeof id === 'string' ? id : undefined;
}

export default function WidgetConfigProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const projectIdFromRouter =
    typeof router.query.wcProjectId === 'string' ? router.query.wcProjectId : undefined;
  const projectId = projectIdFromRouter ?? getWcProjectIdFromUrl();
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
    createElement(WagmiProvider, { config }, children)
  ) as any;
}
