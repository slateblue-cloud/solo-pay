'use client';

import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { useLocale } from '../context/LocaleContext';
import { WALLET_BUTTON_BASE, WALLET_STYLES } from './ConnectWalletButton';

/** Custom button that opens AppKit connect modal (used when NEXT_PUBLIC_WC_PROJECT_ID is set). */
export function MobileConnectButton({ onConnectorClick }: { onConnectorClick?: () => void }) {
  const { t } = useLocale();
  const { open } = useAppKit();
  const { status } = useAccount();
  const isConnecting = status === 'connecting' || status === 'reconnecting';

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => {
          onConnectorClick?.();
          open({ view: 'Connect' });
        }}
        disabled={isConnecting}
        className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.appKit}`}
      >
        {isConnecting ? t('connect.connecting') : t('connect.title')}
      </button>
    </div>
  );
}
