import { useWallet } from '../hooks/useWallet';
import { WALLET_BUTTON_BASE, WALLET_STYLES } from './ConnectWalletButton';

/** PC/fallback connect: injected + MetaMask SDK (MetaMask / Trust Wallet buttons). */
export function PcConnectButton({ className }: { className?: string }) {
  const {
    isPending,
    isMobile,
    isTrustWalletBrowser,
    isMetaMaskBrowser,
    connectMetaMask,
    connectTrustWallet,
    connectInjected,
    pendingConnectorId,
  } = useWallet();

  const isMetaMaskPending =
    isPending && (pendingConnectorId === 'metaMask' || pendingConnectorId === 'metaMaskSDK');
  const isTrustWalletPending =
    isPending &&
    (pendingConnectorId === 'injected' ||
      pendingConnectorId === 'trust' ||
      pendingConnectorId === 'trustWallet');

  const renderWalletButtons = () => {
    // Inside Trust Wallet browser (mobile/tablet) - show single connect button
    if (isMobile && isTrustWalletBrowser) {
      return (
        <button
          onClick={connectTrustWallet}
          disabled={isTrustWalletPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.trustWallet}`}
        >
          {isTrustWalletPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      );
    }

    // Inside MetaMask browser (mobile) - show single connect button
    if (isMobile && isMetaMaskBrowser) {
      return (
        <button
          onClick={connectInjected}
          disabled={isMetaMaskPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.metaMask}`}
        >
          {isMetaMaskPending ? 'Connecting...' : 'Connect Wallet'}
        </button>
      );
    }

    // Mobile without wallet browser OR Desktop - show both wallet options
    return (
      <div className="flex flex-col gap-2">
        {/* MetaMask */}
        <button
          onClick={connectMetaMask}
          disabled={isMetaMaskPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.metaMask}`}
        >
          {isMetaMaskPending ? 'Connecting...' : 'MetaMask'}
        </button>

        {/* Trust Wallet */}
        <button
          onClick={connectTrustWallet}
          disabled={isTrustWalletPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.trustWallet}`}
        >
          {isTrustWalletPending ? 'Connecting...' : 'Trust Wallet'}
        </button>
      </div>
    );
  };

  return (
    <div className={['w-full', className].filter(Boolean).join(' ')}>{renderWalletButtons()}</div>
  );
}
