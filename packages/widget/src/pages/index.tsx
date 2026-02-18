/**
 * Index route: same content as /pc, wrapped in WidgetConfigProvider.
 * When wcProjectId is in the URL, AppKit (WalletConnect) is used; otherwise fallback wagmi (injected + MetaMask SDK).
 * /pc uses global wagmi only (no AppKit).
 */
import WidgetConfigProvider from '../context/WidgetConfigProvider';
import PcPage from './pc';

export default function IndexPage() {
  return (
    <WidgetConfigProvider>
      <PcPage />
    </WidgetConfigProvider>
  );
}
