/**
 * Browser wallet provider detection (window.ethereum / window.trustwallet / EIP-6963).
 * Trust Wallet can inject via window.trustwallet, ethereum.providers[], or EIP-6963.
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

interface EIP6963Entry {
  info: { rdns: string; name?: string };
  provider: EthereumProvider;
}

const eip6963ByRdns: Record<string, EIP6963Entry> = {};
const eip6963List: EIP6963Entry[] = [];

function initEIP6963(): void {
  if (typeof window === 'undefined') return;
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<EIP6963Entry>).detail;
    if (!detail?.info?.rdns || !detail?.provider) return;
    const entry: EIP6963Entry = { info: detail.info, provider: detail.provider };
    eip6963ByRdns[detail.info.rdns] = entry;
    if (!eip6963List.some((x) => x.info.rdns === detail.info.rdns)) {
      eip6963List.push(entry);
    }
  };
  window.addEventListener('eip6963:announceProvider', handler as EventListener);
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  // Give late-injecting wallets (e.g. Trust in popups) a second chance to announce
  setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 400);
}

// Run only in browser (module may load on server)
if (typeof window !== 'undefined') initEIP6963();

/** Re-request EIP-6963 providers so late-injecting wallets (e.g. Trust) can announce. Call before connecting. */
export function requestEIP6963Providers(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  }
}

function getWindowEthereum(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { ethereum?: EthereumProvider }).ethereum;
}

function getWindowTrustWallet(): EthereumProvider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as { trustwallet?: EthereumProvider }).trustwallet;
}

function isTrustProvider(p: EthereumProvider): boolean {
  return !!(p.isTrust || p.isTrustWallet);
}

function isTrustByEntry(entry: EIP6963Entry): boolean {
  const r = (entry.info.rdns || '').toLowerCase();
  const n = (entry.info.name || '').toLowerCase();
  return r.includes('trustwallet') || r.includes('trust.wallet') || n.includes('trust');
}

/** Trust Wallet: window.trustwallet → ethereum.providers[] → window.ethereum → EIP-6963. */
export function getTrustWalletProvider(): EthereumProvider | null {
  const tw = getWindowTrustWallet();
  if (tw) return tw;

  const ethereum = getWindowEthereum();
  if (ethereum) {
    const providers = ethereum.providers || [];
    for (const p of providers) {
      if (isTrustProvider(p)) return p;
    }
    if (providers.length === 0 && isTrustProvider(ethereum)) return ethereum;
  }

  const byRdns = eip6963ByRdns[EIP6963_TRUST_RDNS];
  if (byRdns?.provider) return byRdns.provider;
  const fromList = eip6963List.find(isTrustByEntry);
  return fromList?.provider ?? null;
}

/** MetaMask only (excludes Trust and others). Used for isMetaMaskBrowser. EIP-6963 fallback: io.metamask. */
export function getMetaMaskProvider(): EthereumProvider | null {
  const ethereum = getWindowEthereum();
  if (ethereum) {
    const providers = ethereum.providers || [];
    for (const p of providers) {
      if (p.isMetaMask && !p.isTrust && !p.isTrustWallet && !p.isRainbow && !p.isCoinbaseWallet)
        return p;
    }
    if (
      providers.length === 0 &&
      ethereum.isMetaMask &&
      !ethereum.isTrust &&
      !ethereum.isTrustWallet
    )
      return ethereum;
  }
  const eip = eip6963ByRdns[EIP6963_METAMASK_RDNS];
  return eip?.provider ?? null;
}
