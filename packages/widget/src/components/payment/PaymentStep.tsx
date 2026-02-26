import { useState, useEffect, useRef, useCallback } from 'react';
import { useSwitchChain } from 'wagmi';
import TokenApproval from './TokenApproval';
import PaymentConfirm from './PaymentConfirm';
import PaymentProcessing from './PaymentProcessing';
import PaymentComplete from './PaymentComplete';
import { usePaymentApi } from '../../hooks/usePaymentApi';
import { useWallet } from '../../hooks/useWallet';
import { useToken } from '../../hooks/useToken';
import { useGaslessPayment } from '../../hooks/useGaslessPayment';
import { ConnectWalletButton } from '../ConnectWalletButton';
import LoadingSpinner from '../common/LoadingSpinner';
import { useLocale } from '../../context/LocaleContext';
import type { TranslationKeys } from '../../lib/i18n';
import type { PaymentStepType, WidgetUrlParams } from '../../types/index';
import { formatUnits } from 'viem';

interface PaymentStepProps {
  /** Validated URL parameters from widget initialization */
  urlParams?: WidgetUrlParams;
}

/**
 * Get human-readable network name from chain ID
 */
function getNetworkName(chainId: number): string {
  const networks: Record<number, string> = {
    1: 'Ethereum',
    11155111: 'Sepolia',
    137: 'Polygon',
    80002: 'Polygon Amoy',
    56: 'BSC',
    97: 'BSC Testnet',
    42161: 'Arbitrum',
    10: 'Optimism',
    8453: 'Base',
  };
  return networks[chainId] ?? `Chain ${chainId}`;
}

/**
 * Format number with commas for display
 */
function formatBalance(value: string, maxDecimals = 2): string {
  const num = parseFloat(value);
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxDecimals,
  });
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Parse blockchain error message to user-friendly text (locale-aware via t)
 */
function parseErrorMessage(
  error: string | undefined,
  t: (key: TranslationKeys, params?: Record<string, string | number>) => string
): string | undefined {
  if (!error) return undefined;

  if (error.includes('User rejected') || error.includes('User denied')) {
    return t('error.transactionCancelled');
  }
  if (error.includes('insufficient funds')) {
    return t('error.insufficientFundsGas');
  }
  if (error.includes('exceeds the configured cap')) {
    return t('error.wrongNetwork');
  }
  if (error.includes('reverted') || error.includes('revert')) {
    const match = error.match(/reason:\s*([^,\n]+)/i);
    if (match) return match[1].trim();
    return t('error.transactionFailedRetry');
  }
  if (error.includes('network') || error.includes('connection')) {
    return t('error.networkError');
  }
  if (error.length > 100) {
    return error.substring(0, 100) + '...';
  }
  return error;
}

export default function PaymentStep({ urlParams }: PaymentStepProps) {
  const { t, locale } = useLocale();
  const [currentStep, setCurrentStep] = useState<PaymentStepType>('wallet-connect');
  const [completionDate, setCompletionDate] = useState<string>('');

  // Track if payment was initiated in this session (prevents stale txHash from triggering success)
  const paymentInitiated = useRef(false);

  /** When true, user clicked "Change wallet" — show wallet selection and do not auto-advance on reconnect */
  const userRequestedWalletChange = useRef(false);

  // Error for invalid payment configuration
  const [configError, setConfigError] = useState<string | null>(null);

  // Wallet connection state from wagmi
  const { address, isConnected, chain, disconnect } = useWallet();
  const { switchChainAsync } = useSwitchChain();
  const [isSwitchingChain, setIsSwitchingChain] = useState(false);

  // API hook for payment operations
  const { payment: paymentDetails, isLoading, error: apiError, createPayment } = usePaymentApi();

  // Token operations (balance, allowance, approve)
  const {
    formattedBalance,
    hasAllowance,
    approve,
    isApproving,
    isApprovalConfirming,
    approvalTxHash,
    approvalError,
    refetch: refetchToken,
  } = useToken({
    tokenAddress: paymentDetails?.tokenAddress as `0x${string}` | undefined,
    spenderAddress: paymentDetails?.gatewayAddress as `0x${string}` | undefined,
    userAddress: address,
    decimals: paymentDetails?.tokenDecimals,
    chainId: paymentDetails?.chainId,
  });

  // Gasless payment (meta-transaction)
  const {
    payGasless,
    isPayingGasless,
    isRelayConfirming,
    relayTxHash,
    error: gaslessError,
    isGaslessSupported,
    isPermitSupported,
    isCheckingPermit,
  } = useGaslessPayment({ paymentDetails, publicKey: urlParams?.pk });

  /** Prevents duplicate switchChainAsync (wallet errors on "request already pending") */
  const switchInProgressRef = useRef(false);

  // Prevent double API call in React Strict Mode
  const isInitialized = useRef(false);

  // Create payment on mount when urlParams is available (skip when walletOnly — no gateway API)
  useEffect(() => {
    if (urlParams && !urlParams.walletOnly && !isInitialized.current) {
      isInitialized.current = true;
      createPayment(urlParams);
    }
  }, [urlParams, createPayment]);

  // Human-readable amount (for display)
  // When currency conversion is used, show the converted token amount instead of the fiat input
  const displayAmount = paymentDetails?.currency
    ? formatUnits(BigInt(paymentDetails.amount), paymentDetails.tokenDecimals)
    : (urlParams?.amount ??
      (paymentDetails
        ? formatUnits(BigInt(paymentDetails.amount), paymentDetails.tokenDecimals)
        : '0'));

  // Payment amount in wei (bigint)
  const paymentAmountWei = paymentDetails ? BigInt(paymentDetails.amount) : BigInt(0);

  // Check if user has sufficient allowance
  const needsApproval = !hasAllowance(paymentAmountWei);

  // Step navigation handlers
  const goToWalletConnect = () => setCurrentStep('wallet-connect');
  const goToPaymentConfirm = () => setCurrentStep('payment-confirm');
  const goToPaymentProcessing = () => setCurrentStep('payment-processing');
  const goToPaymentComplete = () => setCurrentStep('payment-complete');

  // Auto-switch chain and advance when wallet connects
  useEffect(() => {
    if (currentStep !== 'wallet-connect') return;
    if (!isConnected || !address || !paymentDetails) return;
    if (userRequestedWalletChange.current) return;

    const targetChainId = paymentDetails.chainId;
    const needsSwitch = chain?.id !== targetChainId;

    if (needsSwitch) {
      if (switchInProgressRef.current || isSwitchingChain) return;
      switchInProgressRef.current = true;
      setIsSwitchingChain(true);
      switchChainAsync({ chainId: targetChainId })
        .then(() => {
          switchInProgressRef.current = false;
          setIsSwitchingChain(false);
        })
        .catch((err) => {
          console.warn('Chain switch failed:', err);
          switchInProgressRef.current = false;
          setIsSwitchingChain(false);
        });
      return;
    }

    if (!isSwitchingChain) {
      if (isPermitSupported === undefined) return;
      if (isPermitSupported) {
        setCurrentStep('payment-confirm');
      } else {
        setCurrentStep('token-approval');
      }
    }
  }, [
    isConnected,
    address,
    paymentDetails,
    isPermitSupported,
    chain?.id,
    isSwitchingChain,
    switchChainAsync,
    currentStep,
  ]);

  // Fallback: if permit check never resolves, advance to token-approval after 12s
  useEffect(() => {
    if (
      !paymentDetails ||
      !isConnected ||
      !address ||
      isPermitSupported !== undefined ||
      currentStep !== 'wallet-connect' ||
      userRequestedWalletChange.current
    ) {
      return;
    }
    const timeout = window.setTimeout(() => setCurrentStep('token-approval'), 12000);
    return () => window.clearTimeout(timeout);
  }, [paymentDetails, isConnected, address, isPermitSupported, currentStep]);

  // Auto-advance after approval confirmation
  useEffect(() => {
    // Only advance if we submitted an approval tx and it finished confirming
    if (approvalTxHash && !isApprovalConfirming && !approvalError) {
      refetchToken();
      goToPaymentConfirm();
    }
  }, [approvalTxHash, isApprovalConfirming, approvalError, refetchToken]);

  // Auto-advance when gasless payment confirms
  useEffect(() => {
    // Only advance if payment was initiated in this session and we have a confirmed relay transaction
    if (
      paymentInitiated.current &&
      currentStep === 'payment-processing' &&
      relayTxHash &&
      !isRelayConfirming &&
      !gaslessError
    ) {
      const dateLocale = locale === 'ko' ? 'ko-KR' : 'en-US';
      setCompletionDate(
        new Date().toLocaleString(dateLocale, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })
      );
      goToPaymentComplete();
    }
  }, [currentStep, relayTxHash, isRelayConfirming, gaslessError, locale]);

  // Check if user has sufficient balance
  const hasSufficientBalance = formattedBalance
    ? parseFloat(formattedBalance) >= parseFloat(displayAmount)
    : true; // Assume true while loading

  // Disconnect handler — always show wallet selection (don't auto-reconnect to previous wallet)
  const handleDisconnect = useCallback(() => {
    userRequestedWalletChange.current = true;
    disconnect();
    goToWalletConnect();
  }, [disconnect]);

  const clearWalletChangeIntent = useCallback(() => {
    userRequestedWalletChange.current = false;
  }, []);

  // Approve handler
  const handleApprove = useCallback(() => {
    if (needsApproval) {
      // Approve max amount for better UX (user won't need to approve again)
      const maxUint256 = BigInt(
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
      );
      approve(maxUint256);
    } else {
      // Already approved, go to confirm
      goToPaymentConfirm();
    }
  }, [needsApproval, approve]);

  // Pay handler (gasless only)
  const handlePay = useCallback(() => {
    // Clear any previous config error
    setConfigError(null);

    // Validate required payment details before proceeding
    if (!paymentDetails?.serverSignature) {
      setConfigError(t('error.configMissingSignature'));
      console.error('Missing server signature - check SIGNER_PRIVATE_KEY configuration');
      return;
    }
    if (!paymentDetails?.recipientAddress || !paymentDetails?.merchantId) {
      setConfigError(t('error.configMissingRecipient'));
      console.error('Missing payment details:', {
        recipientAddress: paymentDetails?.recipientAddress,
        merchantId: paymentDetails?.merchantId,
      });
      return;
    }
    if (!isGaslessSupported) {
      setConfigError(t('error.gaslessNotConfigured'));
      console.error('Missing forwarderAddress - gasless not supported');
      return;
    }

    paymentInitiated.current = true;
    goToPaymentProcessing();
    payGasless();
  }, [payGasless, isGaslessSupported, paymentDetails, t]);

  // Retry payment handler (gasless only)
  const handleRetryPayment = useCallback(() => {
    payGasless();
  }, [payGasless]);

  // Popup = opened via window.open (PC). Else redirect (e.g. mobile).
  const isPopup = typeof window !== 'undefined' && !!window.opener;

  // Allow closing without confirm when user clicks Confirm/Cancel/Go Back
  const allowUnloadRef = useRef(false);

  // Ask user to confirm when closing the window (popup) so we don't lose in-progress payment
  useEffect(() => {
    if (!isPopup || typeof window === 'undefined') return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowUnloadRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isPopup]);

  // Confirm/redirect handler (success)
  const handleConfirm = useCallback(() => {
    if (paymentDetails?.successUrl) {
      allowUnloadRef.current = true;
      const targetOrigin = new URL(paymentDetails.successUrl).origin;
      if (isPopup && window.opener) {
        window.opener.postMessage(
          { type: 'payment_complete', status: 'success', successUrl: paymentDetails.successUrl },
          targetOrigin
        );
        window.close();
      } else {
        window.location.href = paymentDetails.successUrl;
      }
      return;
    }
    goToWalletConnect();
  }, [paymentDetails?.successUrl, isPopup]);

  // Cancel/fail redirect handler
  const handleCancel = useCallback(() => {
    if (urlParams?.failUrl) {
      allowUnloadRef.current = true;
      const targetOrigin = new URL(urlParams.failUrl).origin;
      if (isPopup && window.opener) {
        window.opener.postMessage(
          { type: 'payment_complete', status: 'fail', failUrl: urlParams.failUrl },
          targetOrigin
        );
        window.close();
      } else {
        window.location.href = urlParams.failUrl;
      }
    }
  }, [urlParams?.failUrl, isPopup]);

  // Loading state (skip when walletOnly — no API call)
  if (!urlParams?.walletOnly && isLoading) {
    return <LoadingSpinner />;
  }

  // API Error state (skip when walletOnly)
  if (!urlParams?.walletOnly && apiError) {
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
          <p className="font-medium">{t('error.paymentError')}</p>
        </div>
        <p className="text-sm text-gray-600 mb-4">{apiError}</p>
        {urlParams?.failUrl && (
          <button
            onClick={() => {
              allowUnloadRef.current = true;
              if (isPopup && window.opener) {
                const targetOrigin = new URL(urlParams.failUrl!).origin;
                window.opener.postMessage(
                  { type: 'payment_complete', status: 'fail', failUrl: urlParams.failUrl },
                  targetOrigin
                );
                window.close();
              } else {
                window.location.href = urlParams.failUrl!;
              }
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
          >
            {t('common.goBack')}
          </button>
        )}
      </div>
    );
  }

  // No payment details yet (skip when walletOnly — we never fetch payment)
  if (!urlParams?.walletOnly && !paymentDetails) {
    return <LoadingSpinner />;
  }

  // Wallet-only mode: show connect, then "Wallet connected" with redirect to successUrl
  if (urlParams?.walletOnly) {
    if (!isConnected || !address) {
      return (
        <div className="w-full">
          <ConnectWalletButton />
        </div>
      );
    }
    const handleWalletOnlyContinue = () => {
      allowUnloadRef.current = true;
      const successUrl = urlParams.successUrl;
      try {
        const url = new URL(successUrl);
        url.searchParams.set('wallet', address);
        if (isPopup && window.opener) {
          window.opener.postMessage(
            { type: 'wallet_connected', address, successUrl: url.toString() },
            url.origin
          );
          window.close();
        } else {
          window.location.href = url.toString();
        }
      } catch {
        if (isPopup && window.opener) {
          try {
            window.opener.postMessage(
              { type: 'wallet_connected', address, successUrl },
              new URL(successUrl).origin
            );
          } catch {
            // ignore
          }
          window.close();
        } else {
          window.location.href = successUrl;
        }
      }
    };
    return (
      <div className="text-center py-6">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 text-green-600 mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="font-medium text-gray-900 mb-1">{t('walletOnly.connected')}</p>
        <p className="text-sm text-gray-500 mb-4">{formatAddress(address)}</p>
        <button
          type="button"
          onClick={handleWalletOnlyContinue}
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 active:bg-blue-800"
        >
          {t('common.continue')}
        </button>
        <button
          type="button"
          onClick={handleDisconnect}
          className="mt-3 text-sm text-gray-500 hover:text-gray-700"
        >
          {t('common.disconnect')}
        </button>
      </div>
    );
  }

  const renderStep = () => {
    if (!paymentDetails) return null;
    switch (currentStep) {
      case 'wallet-connect':
        if (userRequestedWalletChange.current) {
          return <ConnectWalletButton onConnectorClick={clearWalletChangeIntent} />;
        }
        if (isConnected && paymentDetails) {
          return (
            <LoadingSpinner
              message={
                isCheckingPermit ? t('error.checkingTokenSupport') : t('error.loadingPayment')
              }
            />
          );
        }
        return <ConnectWalletButton onConnectorClick={clearWalletChangeIntent} />;

      case 'token-approval':
        return (
          <TokenApproval
            walletAddress={address ? formatAddress(address) : ''}
            balance={formatBalance(formattedBalance)}
            token={paymentDetails.tokenSymbol}
            onApprove={handleApprove}
            onDisconnect={handleDisconnect}
            onCancel={urlParams?.failUrl ? handleCancel : undefined}
            isApproving={isApproving || isApprovalConfirming}
            needsApproval={needsApproval}
            error={
              !hasSufficientBalance
                ? t('error.insufficientBalance', {
                    amount: displayAmount,
                    token: paymentDetails.tokenSymbol,
                  })
                : parseErrorMessage(approvalError?.message, t)
            }
          />
        );

      case 'payment-confirm':
        return (
          <PaymentConfirm
            product={`Order #${paymentDetails.orderId}`}
            amount={displayAmount}
            token={paymentDetails.tokenSymbol}
            network={getNetworkName(paymentDetails.chainId)}
            walletAddress={address ? formatAddress(address) : undefined}
            currency={paymentDetails.currency}
            fiatAmount={paymentDetails.fiatAmount}
            error={
              configError ??
              (!hasSufficientBalance
                ? t('error.insufficientBalance', {
                    amount: displayAmount,
                    token: paymentDetails.tokenSymbol,
                  })
                : undefined)
            }
            onPay={handlePay}
            onChangeWallet={handleDisconnect}
            onCancel={urlParams?.failUrl ? handleCancel : undefined}
          />
        );

      case 'payment-processing':
        return (
          <PaymentProcessing
            amount={displayAmount}
            token={paymentDetails.tokenSymbol}
            onRetry={handleRetryPayment}
            onCancel={urlParams?.failUrl ? handleCancel : undefined}
            isPending={isPayingGasless || isRelayConfirming}
            error={parseErrorMessage(gaslessError?.message, t)}
          />
        );

      case 'payment-complete':
        return (
          <PaymentComplete
            amount={displayAmount}
            token={paymentDetails.tokenSymbol}
            date={completionDate}
            txHash={relayTxHash || ''}
            onConfirm={handleConfirm}
          />
        );

      default:
        return null;
    }
  };

  return <div className="w-full">{renderStep()}</div>;
}
