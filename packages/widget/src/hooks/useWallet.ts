import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { getMetaMaskProvider, getTrustWalletProvider } from '../lib/wallet-providers';

// ============================================================================
// Types
// ============================================================================

export interface WalletState {
  /** Connected wallet address */
  address: `0x${string}` | undefined;
  /** Whether a wallet is connected */
  isConnected: boolean;
  /** Current chain info */
  chain: { id: number; name: string } | undefined;
  /** Connection in progress */
  isPending: boolean;
  /** Connection error (failed to connect wallet) */
  error: Error | null;
  /** Is mobile device or tablet */
  isMobile: boolean;
  /** Inside Trust Wallet browser (mobile) or extension available (desktop) */
  isTrustWalletBrowser: boolean;
  /** Inside MetaMask browser (mobile) or extension available (desktop) */
  isMetaMaskBrowser: boolean;
  /** ID of the connector currently trying to connect */
  pendingConnectorId?: string;
}

export interface WalletActions {
  /** Connect via MetaMask (works on desktop extension & mobile via SDK) */
  connectMetaMask: () => void;
  /** Connect via Trust Wallet (desktop: extension, mobile: deeplink) */
  connectTrustWallet: () => void;
  /** Connect using injected provider (when inside wallet browser) */
  connectInjected: () => void;
  /** Disconnect current wallet */
  disconnect: () => void;
}

export interface UseWalletReturn extends WalletState, WalletActions {}

// ============================================================================
// Detection (device + which wallet env; provider resolution is in lib/wallet-providers)
// ============================================================================

/**
 * Detect if device is mobile or tablet (touchscreen without extension support)
 * - Checks user agent for mobile/tablet patterns
 * - Handles iPadOS 13+ which uses desktop-like user agent
 * - Uses touch capability as fallback for tablets
 */
function detectMobile(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent;

  // Standard mobile/tablet detection
  if (/Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(ua)) {
    return true;
  }

  // iPadOS 13+ detection: Safari on iPad reports as Mac, but has touch support
  // Check for Mac + touch capability (real Macs don't have touch)
  const isMacUA = /Macintosh/i.test(ua);
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  if (isMacUA && hasTouch) {
    return true;
  }

  // Android tablets in desktop mode: check for Android + touch
  // Some Android tablets may not have "Android" in UA when in desktop mode,
  // but they'll have touch support and smaller screen
  if (hasTouch && window.innerWidth <= 1024) {
    return true;
  }

  return false;
}

function detectTrustWallet(): boolean {
  return getTrustWalletProvider() !== null;
}

function detectMetaMask(): boolean {
  return getMetaMaskProvider() !== null;
}

// ============================================================================
// Deeplink Generators
// ============================================================================

/**
 * Generate Trust Wallet deeplink to open current page in Trust Wallet browser
 * @see https://developer.trustwallet.com/developer/develop-for-trust/deeplinking
 */
export function getTrustWalletDeeplink(url?: string): string {
  const targetUrl = url ?? (typeof window !== 'undefined' ? window.location.href : '');
  return `trust://open_url?coin_id=60&url=${encodeURIComponent(targetUrl)}`;
}

// ============================================================================
// Hook
// ============================================================================

export function useWallet(): UseWalletReturn {
  const { address, isConnected, chain } = useAccount();
  const { connect, connectors, isPending, error, variables: connectVariables } = useConnect();
  const { disconnect: wagmiDisconnect } = useDisconnect();

  const [isMobile, setIsMobile] = useState(false);
  const [isTrustWalletBrowser, setIsTrustWalletBrowser] = useState(false);
  const [isMetaMaskBrowser, setIsMetaMaskBrowser] = useState(false);

  // Detect environment on mount
  useEffect(() => {
    setIsMobile(detectMobile());
    setIsTrustWalletBrowser(detectTrustWallet());
    setIsMetaMaskBrowser(detectMetaMask());
  }, []);

  const metaMaskConnector = useMemo(
    () => connectors.find((c) => c.id === 'metaMaskSDK' || c.id === 'metaMask'),
    [connectors]
  );
  const injectedConnector = useMemo(
    () => connectors.find((c) => c.id === 'injected'),
    [connectors]
  );

  const trustWalletConnector = useMemo(
    () => connectors.find((c) => c.id === 'trustWallet'),
    [connectors]
  );

  const connectMetaMask = useCallback(() => {
    if (metaMaskConnector) connect({ connector: metaMaskConnector });
  }, [connect, metaMaskConnector]);

  const connectTrustWallet = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (trustWalletConnector) {
      connect({ connector: trustWalletConnector });
      return;
    }
    if (detectMobile()) {
      window.location.href = getTrustWalletDeeplink();
      return;
    }
    window.open('https://trustwallet.com/browser-extension', '_blank');
  }, [connect, trustWalletConnector]);

  const connectInjected = useCallback(() => {
    if (injectedConnector) connect({ connector: injectedConnector });
  }, [connect, injectedConnector]);

  const disconnect = useCallback(() => {
    wagmiDisconnect();
  }, [wagmiDisconnect]);

  return {
    // State
    address,
    isConnected,
    chain: chain ? { id: chain.id, name: chain.name } : undefined,
    isPending,
    error,
    isMobile,
    isTrustWalletBrowser,
    isMetaMaskBrowser,
    pendingConnectorId: (connectVariables?.connector as { id?: string })?.id,
    // Actions
    connectMetaMask,
    connectTrustWallet,
    connectInjected,
    disconnect,
  };
}
