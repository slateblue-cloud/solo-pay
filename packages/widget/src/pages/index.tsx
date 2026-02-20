/**
 * Index route: same content as /pc, wrapped in WidgetConfigProvider.
 * When NEXT_PUBLIC_WC_PROJECT_ID is set, AppKit (WalletConnect) is used; otherwise fallback wagmi (injected + MetaMask SDK).
 * /pc uses global wagmi only (no AppKit).
 */
import type { GetServerSideProps } from 'next';
import WidgetConfigProvider from '../context/WidgetConfigProvider';
import PcPage from './pc';

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};

export default function IndexPage() {
  return (
    <WidgetConfigProvider>
      <PcPage />
    </WidgetConfigProvider>
  );
}
