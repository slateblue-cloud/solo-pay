/**
 * Widget i18n: keys are English text for easier maintenance.
 * Language is driven by URL param `lang` (en | ko). When user changes language in UI, URL is updated and UI re-renders.
 */

export type Locale = 'en' | 'ko';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'ko'];

export const DEFAULT_LOCALE: Locale = 'en';

export type TranslationKeys = keyof typeof translations.en;

const translations = {
  en: {
    'Solo Pay': 'Solo Pay',
    'Secure Blockchain Payment': 'Secure Blockchain Payment',
    'Powered by Solo Pay': 'Powered by Solo Pay',

    'Loading...': 'Loading...',
    Continue: 'Continue',
    Cancel: 'Cancel',
    Change: 'Change',
    Disconnect: 'Disconnect',
    Confirm: 'Confirm',
    'Try Again': 'Try Again',
    'Go Back': 'Go Back',
    'Copy transaction hash': 'Copy transaction hash',

    'Invalid Parameters': 'Invalid Parameters',
    'Payment Error': 'Payment Error',
    'Loading payment...': 'Loading payment...',
    'Checking token support...': 'Checking token support...',
    'Initializing payment...': 'Initializing payment...',
    'Payment configuration error: Missing server signature. Please contact support.':
      'Payment configuration error: Missing server signature. Please contact support.',
    'Payment configuration error: Missing recipient details. Please contact support.':
      'Payment configuration error: Missing recipient details. Please contact support.',
    'Gasless payment is not configured for this network. Please contact support.':
      'Gasless payment is not configured for this network. Please contact support.',
    'Transaction Failed': 'Transaction Failed',
    'Transaction was cancelled by user': 'Transaction was cancelled by user',
    'Insufficient funds for gas fee': 'Insufficient funds for gas fee',
    'Transaction failed. Please check you are on the correct network':
      'Transaction failed. Please check you are on the correct network',
    'Transaction failed. Please try again': 'Transaction failed. Please try again',
    'Network error. Please check your connection': 'Network error. Please check your connection',
    'Insufficient balance. You need {amount} {token}':
      'Insufficient balance. You need {amount} {token}',

    'Connect Wallet': 'Connect Wallet',
    'Please connect your wallet to proceed.\nSupports MetaMask and Trust Wallet.':
      'Please connect your wallet to proceed.\nSupports MetaMask and Trust Wallet.',
    'Connecting...': 'Connecting...',
    MetaMask: 'MetaMask',
    'Trust Wallet': 'Trust Wallet',

    'Wallet connected': 'Wallet connected',

    'Token Approval': 'Token Approval',
    'Already Approved': 'Already Approved',
    'Please approve token spending permission to proceed':
      'Please approve token spending permission to proceed',
    'Token is already approved. Continue to payment.':
      'Token is already approved. Continue to payment.',
    'Connected Wallet': 'Connected Wallet',
    Balance: 'Balance',
    'Approve Token': 'Approve Token',
    'Approving...': 'Approving...',
    'Continue to Payment': 'Continue to Payment',
    'Cancel Payment': 'Cancel Payment',
    'Gas received': 'Gas received',
    'Native token has been sent to your wallet. You can now approve the token below.':
      'Native token has been sent to your wallet. You can now approve the token below.',
    'We provide free gas for token approval once per account. If you do not have enough gas, click the button below to receive it.':
      'We provide free gas for token approval once per account. If you do not have enough gas, click the button below to receive it.',
    'GET GAS': 'GET GAS',
    'Requesting gas...': 'Requesting gas...',

    'Confirm Payment': 'Confirm Payment',
    'Please review your payment details': 'Please review your payment details',
    'Payment Details': 'Payment Details',
    Product: 'Product',
    Network: 'Network',
    'Paying from': 'Paying from',
    'Gas Fee': 'Gas Fee',
    'Free (Covered by Solo Pay)': 'Free (Covered by Solo Pay)',
    Total: 'Total',
    'Pay Now': 'Pay Now',

    'Processing Payment': 'Processing Payment',
    'Please wait a moment': 'Please wait a moment',
    'Payment Amount': 'Payment Amount',
    'Payment Status': 'Payment Status',
    'Requesting Payment': 'Requesting Payment',
    'Signing Transaction': 'Signing Transaction',
    'Confirming Payment': 'Confirming Payment',

    'Payment Complete': 'Payment Complete',
    'Your payment has been successfully processed': 'Your payment has been successfully processed',
    Date: 'Date',
    Amount: 'Amount',
    'Transaction Hash': 'Transaction Hash',
  },
  ko: {
    'Solo Pay': 'Solo Pay',
    'Secure Blockchain Payment': '안전한 블록체인 결제',
    'Powered by Solo Pay': 'Powered by Solo Pay',

    'Loading...': '로딩 중...',
    Continue: '계속',
    Cancel: '취소',
    Change: '변경',
    Disconnect: '연결 해제',
    Confirm: '확인',
    'Try Again': '다시 시도',
    'Go Back': '돌아가기',
    'Copy transaction hash': '트랜잭션 해시 복사',

    'Invalid Parameters': '잘못된 매개변수',
    'Payment Error': '결제 오류',
    'Loading payment...': '결제 정보 불러오는 중...',
    'Checking token support...': '토큰 지원 확인 중...',
    'Initializing payment...': '결제 초기화 중...',
    'Payment configuration error: Missing server signature. Please contact support.':
      '결제 설정 오류: 서버 서명이 없습니다. 고객센터에 문의하세요.',
    'Payment configuration error: Missing recipient details. Please contact support.':
      '결제 설정 오류: 수신자 정보가 없습니다. 고객센터에 문의하세요.',
    'Gasless payment is not configured for this network. Please contact support.':
      '이 네트워크에서는 가스리스 결제가 설정되어 있지 않습니다. 고객센터에 문의하세요.',
    'Transaction Failed': '트랜잭션 실패',
    'Transaction was cancelled by user': '사용자가 트랜잭션을 취소했습니다',
    'Insufficient funds for gas fee': '가스 수수료 잔액이 부족합니다',
    'Transaction failed. Please check you are on the correct network':
      '트랜잭션 실패. 올바른 네트워크인지 확인하세요',
    'Transaction failed. Please try again': '트랜잭션 실패. 다시 시도해 주세요',
    'Network error. Please check your connection': '네트워크 오류. 연결을 확인해 주세요',
    'Insufficient balance. You need {amount} {token}': '잔액이 부족합니다. {amount} {token} 필요',

    'Connect Wallet': '지갑 연결',
    'Please connect your wallet to proceed.\nSupports MetaMask and Trust Wallet.':
      '결제를 위해 지갑을 연결해 주세요.\nMetaMask, Trust Wallet 지원.',
    'Connecting...': '연결 중...',
    MetaMask: 'MetaMask',
    'Trust Wallet': 'Trust Wallet',

    'Wallet connected': '지갑 연결됨',

    'Token Approval': '토큰 승인',
    'Already Approved': '이미 승인됨',
    'Please approve token spending permission to proceed':
      '결제를 위해 토큰 사용 권한을 승인해 주세요',
    'Token is already approved. Continue to payment.':
      '토큰이 이미 승인되었습니다. 결제로 계속합니다.',
    'Connected Wallet': '연결된 지갑',
    Balance: '잔액',
    'Approve Token': '토큰 승인',
    'Approving...': '승인 중...',
    'Continue to Payment': '결제로 계속',
    'Cancel Payment': '결제 취소',
    'Gas received': '가스 수령 완료',
    'Native token has been sent to your wallet. You can now approve the token below.':
      '네이티브 토큰이 지갑으로 전송되었습니다. 아래에서 토큰을 승인할 수 있습니다.',
    'We provide free gas for token approval once per account. If you do not have enough gas, click the button below to receive it.':
      '계정당 한 번 무료 가스를 제공합니다. 가스가 부족하면 아래 버튼을 눌러 받으세요.',
    'GET GAS': '가스 받기',
    'Requesting gas...': '가스 요청 중...',

    'Confirm Payment': '결제 확인',
    'Please review your payment details': '결제 정보를 확인해 주세요',
    'Payment Details': '결제 정보',
    Product: '상품',
    Network: '네트워크',
    'Paying from': '결제 지갑',
    'Gas Fee': '가스 수수료',
    'Free (Covered by Solo Pay)': '무료 (Solo Pay 부담)',
    Total: '총액',
    'Pay Now': '결제하기',

    'Processing Payment': '결제 처리 중',
    'Please wait a moment': '잠시만 기다려 주세요',
    'Payment Amount': '결제 금액',
    'Payment Status': '결제 상태',
    'Requesting Payment': '결제 요청',
    'Signing Transaction': '트랜잭션 서명',
    'Confirming Payment': '결제 확인',

    'Payment Complete': '결제 완료',
    'Your payment has been successfully processed': '결제가 완료되었습니다',
    Date: '일시',
    Amount: '금액',
    'Transaction Hash': '트랜잭션 해시',
  },
} as const;

export function getTranslations(locale: Locale): Record<TranslationKeys, string> {
  const localeMap = locale === 'ko' ? translations.ko : translations.en;
  return localeMap as Record<TranslationKeys, string>;
}

/**
 * Translate key (English text); supports simple {param} substitution.
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
