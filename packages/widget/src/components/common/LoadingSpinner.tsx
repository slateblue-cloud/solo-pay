import { useLocale } from '../../context/LocaleContext';

interface LoadingSpinnerProps {
  message?: string;
}

export default function LoadingSpinner({ message }: LoadingSpinnerProps) {
  const { t } = useLocale();
  const delay = `-${(Date.now() % 1000) / 1000}s`;

  return (
    <div className="text-center py-8">
      <div
        className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"
        style={{ animationDelay: delay }}
      />
      <p className="text-sm text-gray-600">{message ?? t('error.loadingPayment')}</p>
    </div>
  );
}
