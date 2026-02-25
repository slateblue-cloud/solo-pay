import type { GetServerSideProps, NextPage } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { useState, useEffect, useMemo } from 'react';
import { validateWidgetUrlParams } from '../../lib/validation';
import type { UrlParamsValidationResult } from '../../types';
import PaymentStep from '../../components/payment/PaymentStep';
import { LocaleProvider, useLocale } from '../../context/LocaleContext';
import { parseLocale, SUPPORTED_LOCALES } from '../../lib/i18n';

/**
 * Loading spinner component
 */
function LoadingSpinner() {
  const { t } = useLocale();
  return (
    <div className="text-center py-8">
      <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
      <p className="text-sm text-gray-600">{t('common.loading')}</p>
    </div>
  );
}

/**
 * Payment content component
 */
function PaymentContent() {
  const router = useRouter();
  const { t } = useLocale();
  const [validationResult, setValidationResult] = useState<UrlParamsValidationResult | null>(null);

  // Validate URL parameters after mount (client-side only) to avoid hydration mismatch
  useEffect(() => {
    if (!router.isReady) return;

    const searchParams = {
      get: (key: string) => {
        const value = router.query[key];
        return typeof value === 'string' ? value : null;
      },
    };
    setValidationResult(validateWidgetUrlParams(searchParams));
  }, [router.isReady, router.query]);

  // Still loading - show spinner (same on server and client during hydration)
  if (validationResult === null) {
    return <LoadingSpinner />;
  }

  if (!validationResult.isValid) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 mb-4">
          <svg
            className="w-12 h-12 mx-auto mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="font-medium">{t('error.invalidParams')}</p>
        </div>
        <ul className="text-sm text-gray-600 space-y-1">
          {validationResult.errors?.map((error, index) => (
            <li key={index}>{error}</li>
          ))}
        </ul>
      </div>
    );
  }

  return <PaymentStep urlParams={validationResult.params} />;
}

/** Language switcher: updates URL so widget re-renders with new locale */
function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center gap-1">
      {SUPPORTED_LOCALES.map((loc) => (
        <button
          key={loc}
          type="button"
          onClick={() => setLocale(loc)}
          className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
            locale === loc
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
          }`}
        >
          {loc === 'en' ? 'EN' : 'KO'}
        </button>
      ))}
    </div>
  );
}

function WidgetLayout() {
  const { t } = useLocale();
  return (
    <>
      <div className="shrink-0 pb-4 mb-4 border-b border-gray-200 flex items-start justify-between gap-2">
        <div>
          <h1 className="text-base sm:text-lg font-bold text-gray-900">{t('app.title')}</h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">{t('app.tagline')}</p>
        </div>
        <LanguageSwitcher />
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-center overflow-y-auto">
        <PaymentContent />
      </div>
      <p className="shrink-0 text-center text-xs pt-4 sm:pt-6 text-gray-400">
        {t('app.poweredBy')}
      </p>
    </>
  );
}

const Home: NextPage = () => {
  const router = useRouter();
  const locale = useMemo(
    () => parseLocale(router.query.lang as string | undefined),
    [router.query.lang]
  );

  return (
    <>
      <Head>
        <title>Solo Pay</title>
        <meta content="Solo Pay - Mobile Payment" name="description" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link href="/favicon.ico" rel="icon" />
      </Head>

      <main className="sm:flex sm:items-center sm:justify-center sm:min-h-screen bg-transparent">
        <div className="w-full sm:max-w-[520px] h-screen sm:h-[820px] bg-white p-6 py-10 sm:p-8 flex flex-col overflow-hidden sm:rounded-2xl sm:shadow-xl sm:border sm:border-gray-200">
          <LocaleProvider
            locale={locale}
            onLocaleChange={(loc) =>
              router.replace(
                { pathname: router.pathname, query: { ...router.query, lang: loc } },
                undefined,
                { shallow: true }
              )
            }
          >
            <WidgetLayout />
          </LocaleProvider>
        </div>
      </main>
    </>
  );
};

export const getServerSideProps: GetServerSideProps = async () => {
  return { props: {} };
};

export default Home;
