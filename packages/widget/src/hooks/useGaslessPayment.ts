import { useCallback, useState } from 'react';
import { useReadContract, useWalletClient } from 'wagmi';
import { encodeFunctionData } from 'viem';
import { PAYMENT_GATEWAY_ABI, FORWARDER_ABI } from '../lib/contracts';
import { submitGaslessPayment, waitForRelayTransaction, type ForwardRequest } from '../lib/api';
import type { PaymentDetails } from '../types';
import { usePermit, ZERO_PERMIT } from './usePermit';

// ============================================================================
// Types
// ============================================================================

export interface UseGaslessPaymentParams {
  /** Payment details from API */
  paymentDetails: PaymentDetails | null;
  /** Merchant public key for API authentication */
  publicKey?: string;
}

export interface UseGaslessPaymentReturn {
  /** Execute gasless payment */
  payGasless: () => Promise<void>;
  /** Whether gasless payment is in progress */
  isPayingGasless: boolean;
  /** Whether waiting for relay confirmation */
  isRelayConfirming: boolean;
  /** Relay transaction hash (when confirmed) */
  relayTxHash: string | undefined;
  /** Gasless payment error */
  error: Error | null;
  /** Whether gasless is supported (forwarder configured) */
  isGaslessSupported: boolean;
  /** Whether the token supports EIP-2612 permit */
  isPermitSupported: boolean | undefined;
  /** Whether permit support is still being checked (token contract reads in progress) */
  isCheckingPermit: boolean;
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for executing gasless (meta-transaction) payments
 *
 * Uses ERC2771 forwarder for meta-transactions where the relayer pays gas fees.
 * Automatically uses EIP-2612 permit when the token supports it, eliminating
 * the need for a separate approve transaction.
 */
export function useGaslessPayment({
  paymentDetails,
  publicKey,
}: UseGaslessPaymentParams): UseGaslessPaymentReturn {
  const [isPayingGasless, setIsPayingGasless] = useState(false);
  const [isRelayConfirming, setIsRelayConfirming] = useState(false);
  const [relayTxHash, setRelayTxHash] = useState<string>();
  const [error, setError] = useState<Error | null>(null);

  const { data: walletClient } = useWalletClient();

  const forwarderAddress = paymentDetails?.forwarderAddress as `0x${string}` | undefined;
  const gatewayAddress = paymentDetails?.gatewayAddress as `0x${string}` | undefined;
  const tokenAddress = paymentDetails?.tokenAddress as `0x${string}` | undefined;
  const paymentId = paymentDetails?.paymentId as `0x${string}` | undefined;
  const amount = paymentDetails?.amount ? BigInt(paymentDetails.amount) : undefined;
  const recipientAddress = paymentDetails?.recipientAddress as `0x${string}` | undefined;
  const merchantId = paymentDetails?.merchantId as `0x${string}` | undefined;
  const feeBps = paymentDetails?.feeBps ?? 0;
  const serverSignature = paymentDetails?.serverSignature as `0x${string}` | undefined;

  // Check if gasless is supported
  const isGaslessSupported = !!forwarderAddress;

  // EIP-2612 Permit support
  const { isPermitSupported, isCheckingPermit, signPermit } = usePermit({
    tokenAddress,
    spenderAddress: gatewayAddress,
    amount,
    chainId: paymentDetails?.chainId,
  });

  // Get nonce from forwarder contract
  const { data: nonce, refetch: refetchNonce } = useReadContract({
    address: forwarderAddress,
    abi: FORWARDER_ABI,
    functionName: 'nonces',
    args: walletClient?.account?.address ? [walletClient.account.address] : undefined,
    chainId: paymentDetails?.chainId,
    query: {
      enabled: !!forwarderAddress && !!walletClient?.account?.address,
    },
  });

  const payGasless = useCallback(async () => {
    if (
      !walletClient ||
      !walletClient.account ||
      !forwarderAddress ||
      !gatewayAddress ||
      !tokenAddress ||
      !paymentId ||
      !amount ||
      !recipientAddress ||
      !merchantId ||
      !serverSignature
    ) {
      console.error('Missing gasless payment details');
      return;
    }

    try {
      setIsPayingGasless(true);
      setError(null);
      setRelayTxHash(undefined);

      // Refetch nonce to ensure fresh value
      const { data: freshNonce } = await refetchNonce();
      if (freshNonce === undefined) {
        throw new Error('Failed to fetch nonce from Forwarder contract');
      }

      // 1. Try to sign EIP-2612 permit (if token supports it)
      let permitData = ZERO_PERMIT;
      if (isPermitSupported) {
        try {
          permitData = await signPermit();
        } catch (err) {
          const error = err as { name?: string; code?: number };
          if (error.name === 'UserRejectedRequestError' || error.code === 4001) {
            throw err;
          }
          // Permit signing failed (network error, etc.) — retry permit up to 2 more times
          console.warn('Permit signing failed, retrying:', err);
          for (let retry = 0; retry < 2; retry++) {
            try {
              permitData = await signPermit();
              break; // success
            } catch (retryErr) {
              const retryError = retryErr as { name?: string; code?: number };
              if (retryError.name === 'UserRejectedRequestError' || retryError.code === 4001) {
                throw retryErr;
              }
              console.warn(`Permit retry ${retry + 1} failed:`, retryErr);
            }
          }
        }
      }

      // 2. Encode the PaymentGateway.pay() function call with permit
      const payCallData = encodeFunctionData({
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
          permitData,
        ],
      });

      // 3. Create EIP-712 typed data for gasless payment forward request
      const domain = {
        name: 'SoloForwarder',
        version: '1',
        chainId: BigInt(paymentDetails?.chainId ?? 0),
        verifyingContract: forwarderAddress,
      };

      const types = {
        ForwardRequest: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint48' },
          { name: 'data', type: 'bytes' },
        ],
      };

      // Deadline: 10 minutes from now
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

      const forwardMessage = {
        from: walletClient.account.address,
        to: gatewayAddress,
        value: BigInt(0),
        gas: BigInt(300000),
        nonce: freshNonce,
        deadline,
        data: payCallData,
      };

      // 4. Request EIP-712 signature from user
      const signature = await walletClient.signTypedData({
        domain,
        types,
        primaryType: 'ForwardRequest',
        message: forwardMessage,
      });

      // 5. Create ForwardRequest for relay
      const forwardRequest: ForwardRequest = {
        from: walletClient.account.address,
        to: gatewayAddress,
        value: '0',
        gas: '300000',
        nonce: freshNonce.toString(),
        deadline: deadline.toString(),
        data: payCallData,
        signature,
      };

      // 6. Submit to relay service
      setIsPayingGasless(false);
      setIsRelayConfirming(true);

      await submitGaslessPayment(paymentId, forwarderAddress, forwardRequest, publicKey ?? '');

      // 7. Poll relay status until CONFIRMED/FAILED
      const relayResult = await waitForRelayTransaction(paymentId, {
        timeout: 120000,
        interval: 3000,
        publicKey: publicKey ?? undefined,
      });

      setRelayTxHash(relayResult.transactionHash ?? '');
      setIsRelayConfirming(false);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Gasless payment failed'));
      setIsPayingGasless(false);
      setIsRelayConfirming(false);
    }
  }, [
    walletClient,
    forwarderAddress,
    gatewayAddress,
    tokenAddress,
    paymentId,
    amount,
    recipientAddress,
    merchantId,
    feeBps,
    serverSignature,
    paymentDetails?.chainId,
    publicKey,
    refetchNonce,
    isPermitSupported,
    signPermit,
  ]);

  return {
    payGasless,
    isPayingGasless,
    isRelayConfirming,
    relayTxHash,
    error,
    isGaslessSupported,
    isPermitSupported,
    isCheckingPermit,
  };
}
