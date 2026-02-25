/**
 * Widget i18n: semantic keys (app.*, common.*, error.*, etc.).
 * Language is driven by URL param `lang` (en | ko). When user changes language in UI, URL is updated and UI re-renders.
 */

export type Locale = 'en' | 'ko';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ko'];

export const DEFAULT_LOCALE: Locale = 'en';

export type TranslationKeys = keyof typeof translations.en;

const translations = {
  en: {
    // App / layout
    'app.title': 'Solo Pay',
    'app.tagline': 'Secure Blockchain Payment',
    'app.poweredBy': 'Powered by Solo Pay',

    // Common
    'common.loading': 'Loading...',
    'common.continue': 'Continue',
    'common.cancel': 'Cancel',
    'common.change': 'Change',
    'common.disconnect': 'Disconnect',
    'common.confirm': 'Confirm',
    'common.tryAgain': 'Try Again',
    'common.goBack': 'Go Back',
    'common.copyTxHash': 'Copy transaction hash',

    // Errors / validation
    'error.invalidParams': 'Invalid Parameters',
    'error.paymentError': 'Payment Error',
    'error.loadingPayment': 'Loading payment...',
    'error.checkingTokenSupport': 'Checking token support...',
    'error.initializingPayment': 'Initializing payment...',
    'error.configMissingSignature':
      'Payment configuration error: Missing server signature. Please contact support.',
    'error.configMissingRecipient':
      'Payment configuration error: Missing recipient details. Please contact support.',
    'error.gaslessNotConfigured':
      'Gasless payment is not configured for this network. Please contact support.',
    'error.transactionFailed': 'Transaction Failed',
    'error.transactionCancelled': 'Transaction was cancelled by user',
    'error.insufficientFundsGas': 'Insufficient funds for gas fee',
    'error.wrongNetwork': 'Transaction failed. Please check you are on the correct network',
    'error.transactionFailedRetry': 'Transaction failed. Please try again',
    'error.networkError': 'Network error. Please check your connection',
    'error.insufficientBalance': 'Insufficient balance. You need {amount} {token}',

    // Connect wallet
    'connect.title': 'Connect Wallet',
    'connect.description':
      'Please connect your wallet to proceed.\nSupports MetaMask and Trust Wallet.',
    'connect.connecting': 'Connecting...',
    'connect.metaMask': 'MetaMask',
    'connect.trustWallet': 'Trust Wallet',

    // Wallet only
    'walletOnly.connected': 'Wallet connected',
    'walletOnly.continue': 'Continue',

    // Token approval
    'approval.title': 'Token Approval',
    'approval.alreadyApproved': 'Already Approved',
    'approval.description': 'Please approve token spending permission to proceed',
    'approval.descriptionAlready': 'Token is already approved. Continue to payment.',
    'approval.connectedWallet': 'Connected Wallet',
    'approval.balance': 'Balance',
    'approval.approveToken': 'Approve Token',
    'approval.approving': 'Approving...',
    'approval.continueToPayment': 'Continue to Payment',
    'approval.cancelPayment': 'Cancel Payment',
    'approval.gasReceived': 'Gas received',
    'approval.gasReceivedDescription':
      'Native token has been sent to your wallet. You can now approve the token below.',
    'approval.getGasInfo':
      'We provide free gas for token approval once per account. If you do not have enough gas, click the button below to receive it.',
    'approval.getGas': 'GET GAS',
    'approval.requestingGas': 'Requesting gas...',

    // Confirm payment
    'confirm.title': 'Confirm Payment',
    'confirm.reviewDetails': 'Please review your payment details',
    'confirm.paymentDetails': 'Payment Details',
    'confirm.product': 'Product',
    'confirm.network': 'Network',
    'confirm.payingFrom': 'Paying from',
    'confirm.gasFee': 'Gas Fee',
    'confirm.gasFree': 'Free (Covered by Solo Pay)',
    'confirm.total': 'Total',
    'confirm.payNow': 'Pay Now',
    'confirm.cancelPayment': 'Cancel Payment',

    // Processing
    'processing.title': 'Processing Payment',
    'processing.pleaseWait': 'Please wait a moment',
    'processing.paymentAmount': 'Payment Amount',
    'processing.paymentStatus': 'Payment Status',
    'processing.requestingPayment': 'Requesting Payment',
    'processing.signingTransaction': 'Signing Transaction',
    'processing.confirmingPayment': 'Confirming Payment',

    // Complete
    'complete.title': 'Payment Complete',
    'complete.description': 'Your payment has been successfully processed',
    'complete.date': 'Date',
    'complete.amount': 'Amount',
    'complete.transactionHash': 'Transaction Hash',
  },
  ko: {
    'app.title': 'Solo Pay',
    'app.tagline': '안전한 블록체인 결제',
    'app.poweredBy': 'Powered by Solo Pay',

    'common.loading': '로딩 중...',
    'common.continue': '계속',
    'common.cancel': '취소',
    'common.change': '변경',
    'common.disconnect': '연결 해제',
    'common.confirm': '확인',
    'common.tryAgain': '다시 시도',
    'common.goBack': '돌아가기',
    'common.copyTxHash': '트랜잭션 해시 복사',

    'error.invalidParams': '잘못된 매개변수',
    'error.paymentError': '결제 오류',
    'error.loadingPayment': '결제 정보 불러오는 중...',
    'error.checkingTokenSupport': '토큰 지원 확인 중...',
    'error.initializingPayment': '결제 초기화 중...',
    'error.configMissingSignature': '결제 설정 오류: 서버 서명이 없습니다. 고객센터에 문의하세요.',
    'error.configMissingRecipient':
      '결제 설정 오류: 수신자 정보가 없습니다. 고객센터에 문의하세요.',
    'error.gaslessNotConfigured':
      '이 네트워크에서는 가스리스 결제가 설정되어 있지 않습니다. 고객센터에 문의하세요.',
    'error.transactionFailed': '트랜잭션 실패',
    'error.transactionCancelled': '사용자가 트랜잭션을 취소했습니다',
    'error.insufficientFundsGas': '가스 수수료 잔액이 부족합니다',
    'error.wrongNetwork': '트랜잭션 실패. 올바른 네트워크인지 확인하세요',
    'error.transactionFailedRetry': '트랜잭션 실패. 다시 시도해 주세요',
    'error.networkError': '네트워크 오류. 연결을 확인해 주세요',
    'error.insufficientBalance': '잔액이 부족합니다. {amount} {token} 필요',

    'connect.title': '지갑 연결',
    'connect.description': '결제를 위해 지갑을 연결해 주세요.\nMetaMask, Trust Wallet 지원.',
    'connect.connecting': '연결 중...',
    'connect.metaMask': 'MetaMask',
    'connect.trustWallet': 'Trust Wallet',

    'walletOnly.connected': '지갑 연결됨',
    'walletOnly.continue': '계속',

    'approval.title': '토큰 승인',
    'approval.alreadyApproved': '이미 승인됨',
    'approval.description': '결제를 위해 토큰 사용 권한을 승인해 주세요',
    'approval.descriptionAlready': '토큰이 이미 승인되었습니다. 결제로 계속합니다.',
    'approval.connectedWallet': '연결된 지갑',
    'approval.balance': '잔액',
    'approval.approveToken': '토큰 승인',
    'approval.approving': '승인 중...',
    'approval.continueToPayment': '결제로 계속',
    'approval.cancelPayment': '결제 취소',
    'approval.gasReceived': '가스 수령 완료',
    'approval.gasReceivedDescription':
      '네이티브 토큰이 지갑으로 전송되었습니다. 아래에서 토큰을 승인할 수 있습니다.',
    'approval.getGasInfo':
      '계정당 한 번 무료 가스를 제공합니다. 가스가 부족하면 아래 버튼을 눌러 받으세요.',
    'approval.getGas': '가스 받기',
    'approval.requestingGas': '가스 요청 중...',

    'confirm.title': '결제 확인',
    'confirm.reviewDetails': '결제 정보를 확인해 주세요',
    'confirm.paymentDetails': '결제 정보',
    'confirm.product': '상품',
    'confirm.network': '네트워크',
    'confirm.payingFrom': '결제 지갑',
    'confirm.gasFee': '가스 수수료',
    'confirm.gasFree': '무료 (Solo Pay 부담)',
    'confirm.total': '총액',
    'confirm.payNow': '결제하기',
    'confirm.cancelPayment': '결제 취소',

    'processing.title': '결제 처리 중',
    'processing.pleaseWait': '잠시만 기다려 주세요',
    'processing.paymentAmount': '결제 금액',
    'processing.paymentStatus': '결제 상태',
    'processing.requestingPayment': '결제 요청',
    'processing.signingTransaction': '트랜잭션 서명',
    'processing.confirmingPayment': '결제 확인',

    'complete.title': '결제 완료',
    'complete.description': '결제가 완료되었습니다',
    'complete.date': '일시',
    'complete.amount': '금액',
    'complete.transactionHash': '트랜잭션 해시',
  },
} as const;

export function getTranslations(locale: Locale): Record<TranslationKeys, string> {
  const localeMap = locale === 'ko' ? translations.ko : translations.en;
  return localeMap as Record<TranslationKeys, string>;
}

/**
 * Translate by key; supports {param} substitution.
 */
export function t(
  locale: Locale,
  key: TranslationKeys,
  params?: Record<string, string | number>
): string {
  const dict = getTranslations(locale);
  let text = dict[key] ?? (translations.en as Record<string, string>)[key] ?? key;
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    });
  }
  return text;
}

export function parseLocale(value: string | null | undefined): Locale {
  if (value === 'ko' || value === 'en') return value;
  return DEFAULT_LOCALE;
}
