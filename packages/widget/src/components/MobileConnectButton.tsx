'use client';

import { useAccount } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { WALLET_BUTTON_BASE, WALLET_STYLES } from './ConnectWalletButton';

/** Custom button that opens AppKit connect modal (used when wcProjectId is set). */
export function MobileConnectButton() {
  const { open } = useAppKit();
  const { status } = useAccount();
  const isConnecting = status === 'connecting' || status === 'reconnecting';

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => open({ view: 'Connect' })}
        disabled={isConnecting}
        className={`${WALLET_BUTTON_BASE} ${WALLET_STYLES.appKit}`}
      >
        {isConnecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
    </div>
  );
}