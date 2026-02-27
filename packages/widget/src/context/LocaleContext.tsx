'use client';

import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import type { Locale } from '../lib/i18n';
import { t, DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../lib/i18n';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: Parameters<typeof t>[1], params?: Record<string, string | number>) => string;
}

/** Default so useLocale() never throws (SSR or tree order). Provider overwrites. */
const defaultContextValue: LocaleContextValue = {
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (key, params) => t(DEFAULT_LOCALE, key as Parameters<typeof t>[1], params),
};

const LocaleContext = createContext<LocaleContextValue>(defaultContextValue);

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Safe hook that returns context value (same as useLocale when inside provider). */
export function useLocaleOptional(): LocaleContextValue {
  return useContext(LocaleContext);
}

interface LocaleProviderProps {
  children: ReactNode;
  /** Current locale (e.g. from URL params). Defaults to en. */
  locale: Locale;
  /** Replace current URL with same path + updated search params when language changes. */
  onLocaleChange?: (next: Locale) => void;
}

/**
 * Provides locale and t() to the widget. When setLocale is called, it updates the URL
 * (via onLocaleChange or router.replace) so the page re-renders with new lang param.
 */
export function LocaleProvider({ children, locale, onLocaleChange }: LocaleProviderProps) {
  const router = useRouter();

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      if (onLocaleChange) {
        onLocaleChange(next);
        return;
      }
      // Read from window.location (not router.query) because PaymentStep
      // may have replaced the URL via history.replaceState, leaving router.query stale.
      const url = new URL(window.location.href);
      url.searchParams.set('lang', next);
      router.replace(url.pathname + url.search, undefined, { shallow: true });
    },
    [locale, onLocaleChange, router]
  );

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, params) => t(locale, key, params),
    }),
    [locale, setLocale]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export { SUPPORTED_LOCALES, DEFAULT_LOCALE };
