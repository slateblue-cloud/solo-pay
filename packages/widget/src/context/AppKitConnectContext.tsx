'use client';

import { createContext, useContext, type ReactNode } from 'react';

const AppKitConnectContext = createContext(false);

export function useAppKitConnect(): boolean {
  return useContext(AppKitConnectContext);
}

export function AppKitConnectProvider({
  useAppKit,
  children,
}: {
  useAppKit: boolean;
  children: ReactNode;
}) {
  return (
    <AppKitConnectContext.Provider value={useAppKit}>
      {children}
    </AppKitConnectContext.Provider>
  );
}
