import { useCallback } from 'react';
import { useWriteContract, useWaitForTransactionReceipt, useReadContract } from 'wagmi';
import { PAYMENT_GATEWAY_ABI } from '../lib/contracts';
import type { PaymentDetails } from '../types';
import { POLYGON_CHAIN_IDS, POLYGON_PAYMENT_GAS_CONFIG } from '../lib/constants';
import { usePermit, ZERO_PERMIT, type PermitSignature } from './usePermit';

// ============================================================================
// Types
// ============================================================================

export interface UsePaymentParams {
  /** Payment details from API */
  paymentDetails: PaymentDetails | null;
}

export interface UsePaymentReturn {
  /** Execute payment transaction (uses permit if token supports EIP-2612, otherwise traditional approve) */
  pay: () => void;
  /** Execute payment with an explicit permit signature */
  payWithPermit: (permit: PermitSignature) => void;
  /** Whether payment transaction is pending user signature */
  isPaying: boolean;
  /** Whether payment transaction is confirming on-chain */
  isConfirming: boolean;
  /** Payment transaction hash */
  txHash: `0x${string}` | undefined;
  /** Payment error */
  error: Error | null;
  /** Whether payment is already processed */
  isAlreadyProcessed: boolean;
  /** Check if payment was processed */
  checkIfProcessed: () => Promise<boolean>;
  /** Whether the token supports EIP-2612 permit */
  isPermitSupported: boolean | undefined;
  /** Whether permit check is loading */
  isCheckingPermit: boolean;
  /** Whether permit signing is in progress */
  isPermitSigning: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for executing payment transactions
 *
 * Calls the PaymentGateway.pay() function with the payment details from API.
 * Automatically uses EIP-2612 permit when the token supports it, eliminating
 * the need for a separate approve transaction.
 *
 * @example
 * ```tsx
 * const { pay, isPaying, isConfirming, txHash, error, isPermitSupported } = usePayment({
 *   paymentDetails,
 * });
 *
 * // Execute payment (auto-uses permit if supported)
 * const handlePay = () => {
 *   pay();
 * };
 * ```
 */
export function usePayment({ paymentDetails }: UsePaymentParams): UsePaymentReturn {
  const gatewayAddress = paymentDetails?.gatewayAddress as `0x${string}` | undefined;
  const tokenAddress = paymentDetails?.tokenAddress as `0x${string}` | undefined;
  const paymentId = paymentDetails?.paymentId as `0x${string}` | undefined;
  const amount = paymentDetails?.amount ? BigInt(paymentDetails.amount) : undefined;
  const recipientAddress = paymentDetails?.recipientAddress as `0x${string}` | undefined;
  const merchantId = paymentDetails?.merchantId as `0x${string}` | undefined;
  const feeBps = paymentDetails?.feeBps ?? 0;
  const serverSignature = paymentDetails?.serverSignature as `0x${string}` | undefined;

  // EIP-2612 Permit support
  const {
    isPermitSupported,
    isCheckingPermit,
    signPermit,
    isSigning: isPermitSigning,
  } = usePermit({
    tokenAddress,
    spenderAddress: gatewayAddress,
    amount,
    chainId: paymentDetails?.chainId,
  });

  // Check if payment is already processed
  const { data: isProcessed, refetch: refetchProcessed } = useReadContract({
    address: gatewayAddress,
    abi: PAYMENT_GATEWAY_ABI,
    functionName: 'processedPayments',
    args: paymentId ? [paymentId] : undefined,
    query: {
      enabled: !!gatewayAddress && !!paymentId,
    },
  });

  // Write pay
  const {
    writeContract,
    data: txHash,
    isPending: isPaying,
    error: writeError,
  } = useWriteContract();

  // Wait for transaction confirmation
  const { isLoading: isConfirming, error: receiptError } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Internal pay with explicit permit
  const payWithPermit = useCallback(
    (permit: PermitSignature) => {
      if (
        !gatewayAddress ||
        !tokenAddress ||
        !paymentId ||
        !amount ||
        !recipientAddress ||
        !merchantId ||
        !serverSignature
      ) {
        console.error('Missing payment details');
        return;
      }

      const gasConfig =
        paymentDetails?.chainId && POLYGON_CHAIN_IDS.includes(paymentDetails.chainId)
          ? POLYGON_PAYMENT_GAS_CONFIG
          : {};

      writeContract({
        address: gatewayAddress,
        abi: PAYMENT_GATEWAY_ABI,
        functionName: 'pay',
        args: [
          paymentId,
          tokenAddress,
          amount,
          recipientAddress,
          merchantId,
          feeBps,
          serverSignature,
          permit as { deadline: bigint; v: number; r: `0x${string}`; s: `0x${string}` },
        ],
        chainId: paymentDetails?.chainId,
        ...gasConfig,
      });
    },
    [
      gatewayAddress,
      tokenAddress,
      paymentId,
      amount,
      recipientAddress,
      merchantId,
      feeBps,
      serverSignature,
      paymentDetails?.chainId,
      writeContract,
    ]
  );

  // Pay function — auto-signs permit if token supports it, otherwise uses zero permit (traditional approve)
  const pay = useCallback(() => {
    if (!isPermitSupported) {
      // Fallback to traditional approve flow (zero permit)
      payWithPermit(ZERO_PERMIT);
      return;
    }

    // Sign permit then submit transaction
    signPermit()
      .then((permit) => {
        payWithPermit(permit);
      })
      .catch((err) => {
        console.warn('Permit signing failed, falling back to approve flow:', err);
        // Fallback to zero permit (requires prior approval)
        payWithPermit(ZERO_PERMIT);
      });
  }, [isPermitSupported, signPermit, payWithPermit]);

  // Check if payment was processed
  const checkIfProcessed = useCallback(async (): Promise<boolean> => {
    const result = await refetchProcessed();
    return result.data === true;
  }, [refetchProcessed]);

  return {
    pay,
    payWithPermit,
    isPaying,
    isConfirming,
    txHash,
    error: writeError || receiptError || null,
    isAlreadyProcessed: isProcessed === true,
    checkIfProcessed,
    isPermitSupported,
    isCheckingPermit,
    isPermitSigning,
  };
}
