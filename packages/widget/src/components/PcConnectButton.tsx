import { useWallet } from '../hooks/useWallet';
import { useLocale } from '../context/LocaleContext';
import { WALLET_BUTTON_BASE, WALLET_STYLES } from './ConnectWalletButton';

/** PC/fallback connect: injected + MetaMask SDK (MetaMask / Trust Wallet buttons). */
export function PcConnectButton({ className }: { className?: string }) {
  const { t } = useLocale();
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
  const isTrustWalletPending = isPending && pendingConnectorId === 'trustWallet';

  const renderWalletButtons = () => {
    if (isMobile && isTrustWalletBrowser) {
      return (
        <button
          onClick={connectTrustWallet}
          disabled={isTrustWalletPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.trustWallet}`}
        >
          {isTrustWalletPending ? t('connect.connecting') : t('connect.title')}
        </button>
      );
    }

    if (isMobile && isMetaMaskBrowser) {
      return (
        <button
          onClick={connectInjected}
          disabled={isMetaMaskPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.metaMask}`}
        >
          {isMetaMaskPending ? t('connect.connecting') : t('connect.title')}
        </button>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <button
          onClick={connectMetaMask}
          disabled={isMetaMaskPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.metaMask}`}
        >
          {isMetaMaskPending ? t('connect.connecting') : t('connect.metaMask')}
        </button>

        <button
          onClick={connectTrustWallet}
          disabled={isTrustWalletPending}
          type="button"
          className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.trustWallet}`}
        >
          {isTrustWalletPending ? t('connect.connecting') : t('connect.trustWallet')}
        </button>
      </div>
    );
  };

  return (
    <div className={['w-full', className].filter(Boolean).join(' ')}>{renderWalletButtons()}</div>
  );
}
