import { useEffect, useRef, useCallback } from 'react';
import SoloPay from '@solo-pay/widget-js';
import type { PaymentRequest } from '@solo-pay/widget-js';

/**
 * Shape of success data when the user is redirected to your successUrl.
 * Use this type when handling the success page or webhook payloads (the widget does not fire a client-side success callback).
 */
export interface WidgetSuccessResponse {
  orderId: string;
  paymentId?: string;
  txHash?: string;
  [key: string]: unknown;
}

/** Error from payment flow or popup */
export interface WidgetError {
  message: string;
  code?: string;
  [key: string]: unknown;
}

/** Config for useWidget. publicKey is your merchant public key (pk_xxx or test key). */
export interface UseWidgetConfig {
  /** Merchant public key (e.g. pk_test_xxx or pk_live_xxx) */
  publicKey: string;
  /** Called on payment or popup error */
  onError?: (error: WidgetError) => void;
  /** Called when user closes the popup without completing */
  onClose?: () => void;
  /** Widget base URL (default: https://widget.solo-pay.com) */
  widgetUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /**
   * Defaults for openWidget() so you can call openWidget({ orderId, amount }) only.
   * Provide tokenAddress, successUrl, failUrl, locale here or pass them per call.
   */
  defaultPaymentRequest?: Partial<
    Pick<PaymentRequest, 'tokenAddress' | 'successUrl' | 'failUrl' | 'currency' | 'locale'>
  >;
}

/** Argument for openWidget(); can be partial if defaultPaymentRequest is set in config. */
export type OpenWidgetPayload = Partial<PaymentRequest> &
  Pick<PaymentRequest, 'orderId' | 'amount'>;

export interface UseWidgetReturn {
  /** Open the payment popup (or redirect on mobile). Pass orderId, amount, and optionally tokenAddress, successUrl, failUrl, currency. */
  openWidget: (data: OpenWidgetPayload) => void;
  /** Close the popup if open (PC only). */
  closeWidget: () => void;
}

/**
 * React hook for SoloPay payment widget. Initializes the core on mount and destroys on unmount.
 *
 * @example
 * const { openWidget } = useWidget({
 *   publicKey: 'pk_test_xxxxx',
 *   onError: (err) => console.error(err),
 *   onClose: () => console.log('closed'),
 *   defaultPaymentRequest: { tokenAddress: '0x...', successUrl: '/success', failUrl: '/fail' }
 * });
 * openWidget({ orderId: 'ORDER_001', amount: 50000 });
 * // Success is handled via redirect to successUrl; handle it on that page or via webhook.
 */
export function useWidget(config: UseWidgetConfig): UseWidgetReturn {
  const instanceRef = useRef<SoloPay | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const { publicKey, widgetUrl, debug } = configRef.current;
    if (!publicKey) return;
    instanceRef.current = new SoloPay({
      publicKey,
      widgetUrl,
      debug,
    });
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [config.publicKey, config.widgetUrl]);

  const openWidget = useCallback((data: OpenWidgetPayload) => {
    const instance = instanceRef.current;
    if (!instance) return;

    const defaults = configRef.current.defaultPaymentRequest ?? {};
    const request: PaymentRequest = {
      orderId: data.orderId,
      amount: data.amount,
      tokenAddress: data.tokenAddress ?? defaults.tokenAddress ?? '',
      successUrl: data.successUrl ?? defaults.successUrl ?? '',
      failUrl: data.failUrl ?? defaults.failUrl ?? '',
      ...((data.currency ?? defaults.currency) != null && {
        currency: data.currency ?? defaults.currency,
      }),
      ...((data.locale ?? defaults.locale) != null && {
        locale: data.locale ?? defaults.locale,
      }),
    };

    const missing: string[] = [];
    if (!request.tokenAddress) missing.push('tokenAddress');
    if (!request.successUrl) missing.push('successUrl');
    if (!request.failUrl) missing.push('failUrl');
    if (missing.length > 0) {
      const err: WidgetError = {
        message: `Missing required payment fields: ${missing.join(', ')}. Set them in openWidget() or in useWidget defaultPaymentRequest.`,
        code: 'MISSING_FIELDS',
      };
      configRef.current.onError?.(err);
      return;
    }

    try {
      instance.requestPayment(request, {
        onClose: configRef.current.onClose,
      });
    } catch (err) {
      configRef.current.onError?.({
        message: err instanceof Error ? err.message : String(err),
        code: 'REQUEST_PAYMENT_ERROR',
      });
    }
  }, []);

  const closeWidget = useCallback(() => {
    instanceRef.current?.closeWidget();
  }, []);

  return { openWidget, closeWidget };
}
