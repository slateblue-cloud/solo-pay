/**
 * AppKit (Reown / WalletConnect) config. projectId comes from URL param wcProjectId (WidgetConfigProvider).
 */

/** WalletGuide wallet IDs for featuredWalletIds / includeWalletIds (MetaMask + Trust only). */
export const APPKIT_WALLET_IDS = [
  'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
  '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
] as const;

/** App metadata for wallet connection modal (same shape as msqpay.js). url set at runtime via getMetadata(). */
export const metadata = {
  name: process.env.NEXT_PUBLIC_APP_NAME ?? 'Solo Pay',
  description: 'Cryptocurrency Payment',
  url: '',
  icons: [] as string[],
};

export function getMetadata() {
  return {
    ...metadata,
    url: typeof window !== 'undefined' ? window.location.origin : '',
  };
}
