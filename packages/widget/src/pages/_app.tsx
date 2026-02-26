import '../styles/globals.css';
import type { AppProps } from 'next/app';
import { useEffect, useState } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider } from 'wagmi';

import { config } from '../wagmi';

function MyApp({ Component, pageProps }: AppProps) {
  const [client] = useState(() => new QueryClient());

  useEffect(() => {
    localStorage.removeItem('wagmi.recentConnectorId');
    localStorage.removeItem('wagmi.store');
  }, []);

  return (
    <WagmiProvider config={config} reconnectOnMount={false}>
      <QueryClientProvider client={client}>
        <Component {...pageProps} />
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export default MyApp;
