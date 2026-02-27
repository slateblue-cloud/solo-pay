import type { WidgetUrlParams, UrlParamsValidationResult, WidgetLocale } from '../types';

/**
 * Validate URL parameters for widget initialization
 *
 * Supports two modes:
 * 1. **Creation mode**: pk + orderId + amount + tokenAddress + successUrl + failUrl (all required)
 * 2. **Resume mode**: pk + paymentId (skips creation, fetches existing payment from server)
 *
 * Optional: currency, walletOnly, lang (en | ko)
 *
 * @example
 * ```tsx
 * const result = validateWidgetUrlParams(searchParams);
 * if (!result.isValid) {
 *   return <ErrorPage errors={result.errors} />;
 * }
 * if (result.params.paymentId) {
 *   // Resume mode — fetch payment details from server
 * } else {
 *   // Creation mode — create new payment
 * }
 * ```
 */
export function validateWidgetUrlParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): UrlParamsValidationResult {
  const errors: string[] = [];

  // Extract common parameters
  const pk = searchParams.get('pk');
  const paymentId = searchParams.get('paymentId');
  const currency = searchParams.get('currency');
  const walletOnlyRaw = searchParams.get('walletOnly');
  const walletOnly = walletOnlyRaw === '1' || walletOnlyRaw === 'true' || walletOnlyRaw === 'yes';
  const langRaw = searchParams.get('lang');
  const lang: WidgetLocale = langRaw === 'ko' || langRaw === 'en' ? langRaw : 'en';

  // pk is always required
  if (!pk || pk.trim() === '') {
    errors.push('pk (public key) is required');
  } else if (!pk.startsWith('pk_')) {
    errors.push('pk must start with "pk_"');
  }

  // Resume mode: only pk + paymentId required
  if (paymentId && paymentId.trim() !== '') {
    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    return {
      isValid: true,
      params: {
        pk: pk!,
        paymentId,
        // Provide empty defaults for required fields — they will be populated from server
        orderId: '',
        amount: '',
        tokenAddress: '',
        successUrl: '',
        failUrl: '',
        lang,
      },
    };
  }

  // Creation mode: validate all required fields
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');
  const tokenAddress = searchParams.get('tokenAddress');
  const successUrl = searchParams.get('successUrl');
  const failUrl = searchParams.get('failUrl');

  if (!orderId || orderId.trim() === '') {
    errors.push('orderId is required');
  } else if (orderId.length > 255) {
    errors.push('orderId must be 255 characters or less');
  } else if (!/^[a-zA-Z0-9_\-.:]+$/.test(orderId)) {
    errors.push(
      'orderId must contain only alphanumeric characters, hyphens, underscores, dots, and colons'
    );
  }

  if (!amount || amount.trim() === '') {
    errors.push('amount is required');
  } else {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      errors.push('amount must be a positive number');
    }
  }

  if (!tokenAddress || tokenAddress.trim() === '') {
    errors.push('tokenAddress is required');
  } else if (!/^0x[a-fA-F0-9]{40}$/.test(tokenAddress)) {
    errors.push('tokenAddress must be a valid Ethereum address (0x + 40 hex characters)');
  }

  if (!successUrl || successUrl.trim() === '') {
    errors.push('successUrl is required');
  } else if (!isValidUrl(successUrl)) {
    errors.push('successUrl must be a valid URL');
  }

  if (!failUrl || failUrl.trim() === '') {
    errors.push('failUrl is required');
  } else if (!isValidUrl(failUrl)) {
    errors.push('failUrl must be a valid URL');
  }

  // Return result
  if (errors.length > 0) {
    return { isValid: false, errors };
  }

  return {
    isValid: true,
    params: {
      pk: pk!,
      orderId: orderId!,
      amount: amount!,
      tokenAddress: tokenAddress!,
      successUrl: successUrl!,
      failUrl: failUrl!,
      ...(currency ? { currency } : {}),
      ...(walletOnly ? { walletOnly: true } : {}),
      lang,
    },
  };
}

/**
 * Check if a string is a valid URL
 */
function isValidUrl(str: string): boolean {
  try {
    new URL(str);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get widget URL parameters from URLSearchParams (convenience wrapper)
 *
 * @returns Validated params or null if validation fails
 *
 * @example
 * ```tsx
 * const params = getWidgetParams(searchParams);
 * if (!params) {
 *   return <div>Invalid parameters</div>;
 * }
 * ```
 */
export function getWidgetParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null }
): WidgetUrlParams | null {
  const result = validateWidgetUrlParams(searchParams);
  return result.isValid ? result.params! : null;
}
