'use client';

import { useAppKitConnect } from '../context/AppKitConnectContext';
import { useLocale } from '../context/LocaleContext';
import { PcConnectButton } from './PcConnectButton';
import { MobileConnectButton } from './MobileConnectButton';

/** Shared base styles for wallet connect buttons (PC and AppKit). */
export const WALLET_BUTTON_BASE =
  'w-full rounded-xl px-6 py-3 sm:py-4 text-sm sm:text-lg font-semibold text-white shadow-sm disabled:opacity-50 transition-colors';

export const WALLET_STYLES = {
  metaMask: 'bg-[#F6851B] hover:bg-[#e2761b] active:bg-[#cd6116]',
  trustWallet: 'bg-[#3375BB] hover:bg-[#2a5f99] active:bg-[#1e4a7a]',
  appKit: 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800',
} as const;

/**
 * Connect step: icon, title, description, then MobileConnectButton (AppKit) or PcConnectButton (injected + MetaMask SDK).
 */
export function ConnectWalletButton({ className }: { className?: string }) {
  const isAppKit = useAppKitConnect();
  const { t } = useLocale();

  return (
    <div className={['w-full', className].filter(Boolean).join(' ')}>
      {/* Wallet Icon */}
      <div className="flex justify-center mb-8 sm:mb-10">
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-blue-50 flex items-center justify-center">
          <svg
            className="w-8 h-8 sm:w-10 sm:h-10 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3"
            />
          </svg>
        </div>
      </div>

      {/* Title */}
      <div className="text-center mb-5">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">{t('connect.title')}</h1>
      </div>

      {/* Description */}
      <div className="text-center mb-10 sm:mb-12">
        <p className="text-xs sm:text-sm text-gray-500 leading-relaxed">
          {t('connect.description')
            .split('\n')
            .map((line, i) => (
              <span key={i}>
                {line}
                {i === 0 && <br />}
              </span>
            ))}
        </p>
      </div>

      <div className="flex justify-center w-full">
        {isAppKit ? <MobileConnectButton /> : <PcConnectButton className={className} />}
      </div>
    </div>
  );
}
