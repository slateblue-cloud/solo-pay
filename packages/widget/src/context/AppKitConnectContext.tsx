'use client';

import { createContext, createElement, useContext, type ReactNode } from 'react';

const AppKitConnectContext = createContext<boolean>(false);

export function useAppKitConnect(): boolean {
  return useContext(AppKitConnectContext);
}

export function AppKitConnectProvider({
  useAppKit,
  children,
}: {
  useAppKit: boolean;
  children?: ReactNode;
}): ReactNode {
  return createElement(AppKitConnectContext.Provider, { value: useAppKit }, children);
}
