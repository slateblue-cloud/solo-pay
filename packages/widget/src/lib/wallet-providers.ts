/**
 * Browser wallet provider detection (window.ethereum / window.trustwallet / EIP-6963).
 * Matches msqpay.js logic so Trust Wallet works when it injects late or via EIP-6963.
 */

export interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
  isMetaMask?: boolean;
  isTrust?: boolean;
  isTrustWallet?: boolean;
  isRainbow?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: EthereumProvider[];
}

const EIP6963_TRUST_RDNS = 'com.trustwallet.app';
const EIP6963_METAMASK_RDNS = 'io.metamask';

const eip6963Providers: Record<string, { info: { rdns: string }; provider: EthereumProvider }> = {};

function initEIP6963(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('eip6963:announceProvider', ((event: CustomEvent<{ info: { rdns: string }; provider: EthereumProvider }>) => {
    const { info, provider } = event.detail;
    if (info?.rdns) eip6963Providers[info.rdns] = { info, provider };
  }) as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}
initEIP6963();

function getWindowEthereum(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { ethereum?: EthereumProvider }).ethereum;
}

function getWindowTrustWallet(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { trustwallet?: EthereumProvider }).trustwallet;
}

/** Trust Wallet: window.trustwallet → ethereum.providers[] → window.ethereum → EIP-6963 (com.trustwallet.app). */
export function getTrustWalletProvider(): EthereumProvider | null {
  const tw = getWindowTrustWallet();
  if (tw) return tw;
  const ethereum = getWindowEthereum();
  if (ethereum) {
    const providers = ethereum.providers || [];
    for (const p of providers) {
      if (p.isTrust || p.isTrustWallet) return p;
    }
    if (providers.length === 0 && (ethereum.isTrust || ethereum.isTrustWallet)) return ethereum;
  }
  const eip = eip6963Providers[EIP6963_TRUST_RDNS];
  return eip ? eip.provider : null;
}

/** MetaMask only (excludes Trust and others). Used for isMetaMaskBrowser. EIP-6963 fallback: io.metamask. */
export function getMetaMaskProvider(): EthereumProvider | null {
  const ethereum = getWindowEthereum();
  if (ethereum) {
    const providers = ethereum.providers || [];
    for (const p of providers) {
      if (p.isMetaMask && !p.isTrust && !p.isTrustWallet && !p.isRainbow && !p.isCoinbaseWallet) return p;
    }
    if (providers.length === 0 && ethereum.isMetaMask && !ethereum.isTrust && !ethereum.isTrustWallet) return ethereum;
  }
  const eip = eip6963Providers[EIP6963_METAMASK_RDNS];
  return eip ? eip.provider : null;
}
