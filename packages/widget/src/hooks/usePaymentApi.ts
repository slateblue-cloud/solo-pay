import { useState, useCallback } from 'react';
import type { WidgetUrlParams, PaymentDetails } from '../types';
import {
  createPaymentFromUrlParams,
  getPaymentStatus,
  pollPaymentStatus,
  PaymentApiError,
  type PaymentStatusResponse,
} from '../lib/api';

// ============================================================================
// Types
// ============================================================================

export interface UsePaymentApiState {
  payment: PaymentDetails | null;
  status: PaymentStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  errorCode: string | null;
}

export interface UsePaymentApiActions {
  createPayment: (urlParams: WidgetUrlParams) => Promise<PaymentDetails | null>;
  checkStatus: (paymentId: string) => Promise<PaymentStatusResponse | null>;
  waitForConfirmation: (
    paymentId: string,
    onStatusChange?: (status: PaymentStatusResponse) => void
  ) => Promise<PaymentStatusResponse | null>;
  clearError: () => void;
  reset: () => void;
}

export interface UsePaymentApiReturn extends UsePaymentApiState, UsePaymentApiActions {}

// ============================================================================
// Hook
// ============================================================================

export function usePaymentApi(): UsePaymentApiReturn {
  const [payment, setPayment] = useState<PaymentDetails | null>(null);
  const [status, setStatus] = useState<PaymentStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const createPayment = useCallback(
    async (urlParams: WidgetUrlParams): Promise<PaymentDetails | null> => {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        const result = await createPaymentFromUrlParams(urlParams);
        setPayment(result);
        setPublicKey(urlParams.pk);
        return result;
      } catch (err) {
        console.error(err);
        if (err instanceof PaymentApiError) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to create payment');
          setErrorCode('UNKNOWN_ERROR');
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const checkStatus = useCallback(
    async (paymentId: string): Promise<PaymentStatusResponse | null> => {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        const options = publicKey ? { publicKey } : undefined;
        const result = await getPaymentStatus(paymentId, options);
        setStatus(result);
        return result;
      } catch (err) {
        if (err instanceof PaymentApiError) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to get status');
          setErrorCode('UNKNOWN_ERROR');
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey]
  );

  const waitForConfirmation = useCallback(
    async (
      paymentId: string,
      onStatusChange?: (status: PaymentStatusResponse) => void
    ): Promise<PaymentStatusResponse | null> => {
      setIsLoading(true);
      setError(null);
      setErrorCode(null);

      try {
        const result = await pollPaymentStatus(paymentId, {
          onStatusChange: (s) => {
            setStatus(s);
            onStatusChange?.(s);
          },
          publicKey: publicKey ?? undefined,
        });
        return result;
      } catch (err) {
        if (err instanceof PaymentApiError) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to confirm payment');
          setErrorCode('UNKNOWN_ERROR');
        }
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [publicKey]
  );

  const clearError = useCallback(() => {
    setError(null);
    setErrorCode(null);
  }, []);

  const reset = useCallback(() => {
    setPayment(null);
    setStatus(null);
    setPublicKey(null);
    setIsLoading(false);
    setError(null);
    setErrorCode(null);
  }, []);

  return {
    payment,
    status,
    isLoading,
    error,
    errorCode,
    createPayment,
    checkStatus,
    waitForConfirmation,
    clearError,
    reset,
  };
}
