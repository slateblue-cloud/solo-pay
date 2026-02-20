interface PaymentConfirmProps {
  product: string;
  amount: string;
  token: string;
  network: string;
  walletAddress?: string;
  currency?: string;
  fiatAmount?: number;
  error?: string;
  onPay?: () => void;
  onChangeWallet?: () => void;
  onCancel?: () => void;
}

export default function PaymentConfirm({
  product,
  amount,
  token,
  network,
  walletAddress,
  currency,
  fiatAmount,
  error,
  onPay,
  onChangeWallet,
  onCancel,
}: PaymentConfirmProps) {
  return (
    <div className="w-full px-4 pt-0 pb-3 sm:px-6 sm:pt-0 sm:pb-5">
      {/* Title */}
      <div className="text-center mb-5 sm:mb-6">
        <h1 className="text-base sm:text-lg font-bold text-gray-900">Confirm Payment</h1>
        <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
          Please review your payment details
        </p>
      </div>

      {/* Payment Details */}
      <div className="rounded-xl bg-gray-50 border border-gray-100 p-3.5 sm:p-4 mb-5 sm:mb-6">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2.5 sm:mb-3">
          Payment Details
        </h2>

        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-gray-500">Product</span>
            <span className="text-xs sm:text-sm font-medium text-gray-900">{product}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs sm:text-sm text-gray-500">Network</span>
            <span className="text-xs sm:text-sm font-medium text-gray-900">{network}</span>
          </div>
          {walletAddress && (
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm text-gray-500">Paying from</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs sm:text-sm font-mono font-medium text-gray-900">
                  {walletAddress}
                </span>
                {onChangeWallet && (
                  <button
                    type="button"
                    onClick={onChangeWallet}
                    className="text-xs text-blue-600 hover:text-blue-500 font-medium cursor-pointer"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="border-t border-gray-200 pt-1.5 sm:pt-2 mt-1.5 sm:mt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs sm:text-sm text-gray-500">Gas Fee</span>
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 rounded-full bg-green-50 text-green-700 text-xs font-medium">
                Free (Covered by Solo Pay)
              </span>
            </div>
          </div>

          {/* Total - highlighted within the card */}
          <div className="border-t-2 border-blue-200 pt-2.5 sm:pt-3 mt-1.5 sm:mt-2">
            <div className="flex items-end justify-between rounded-lg bg-blue-50 p-2.5 sm:p-3">
              <span className="text-sm sm:text-base font-semibold text-blue-700">Total</span>
              <div className="text-right">
                {currency && fiatAmount !== undefined && (
                  <span className="block text-xs text-blue-500">
                    {fiatAmount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currency}
                  </span>
                )}
                <span className="text-sm sm:text-base font-bold text-blue-700">
                  {amount} {token}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 p-2.5 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Pay Button (hidden when error is present) */}
      {!error && (
        <button
          type="button"
          className="w-full py-2.5 sm:py-3 rounded-xl text-white text-sm font-semibold transition-colors bg-blue-600 hover:bg-blue-500 active:bg-blue-700 cursor-pointer"
          onClick={onPay}
        >
          Pay Now
        </button>
      )}

      {/* Cancel Button */}
      {onCancel && (
        <button
          type="button"
          className="w-full mt-2 py-2.5 sm:py-3 rounded-xl bg-gray-100 text-gray-600 text-sm font-semibold hover:bg-gray-200 transition-colors cursor-pointer"
          onClick={onCancel}
        >
          Cancel Payment
        </button>
      )}
    </div>
  );
}
