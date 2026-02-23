export { useWidget } from './useWidget';
export type {
  UseWidgetConfig,
  UseWidgetReturn,
  OpenWidgetPayload,
  WidgetSuccessResponse,
  WidgetError,
} from './useWidget';

// Re-export core types for convenience
export type { PaymentRequest, PaymentResult, SoloPayConfig } from '@solo-pay/widget-js';
