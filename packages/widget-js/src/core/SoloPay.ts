import type { SoloPayConfig, PaymentRequest, RedirectMode } from '../types';
import { WidgetLauncher } from '../utils/widget-launcher';
import { validatePaymentRequest } from '../utils/validators';

/** Options for requestPayment */
export interface RequestPaymentOptions {
  /** Callback when widget is closed (e.g. when user closes the popup on PC) */
  onClose?: () => void;
}

interface SoloPayConfigInternal {
  publicKey: string;
  widgetUrl: string;
  debug: boolean;
  redirectMode: RedirectMode;
}

/** Main SoloPay class */
export class SoloPay {
  private config: SoloPayConfigInternal;
  private widgetLauncher: WidgetLauncher;

  constructor(config: SoloPayConfig) {
    if (!config.publicKey) {
      throw new Error('[SoloPay] publicKey is required');
    }

    this.config = {
      publicKey: config.publicKey,
      widgetUrl: config.widgetUrl ?? 'https://widget.solo-pay.com',
      debug: config.debug ?? false,
      redirectMode: config.redirectMode ?? 'auto',
    };

    this.widgetLauncher = new WidgetLauncher({
      publicKey: this.config.publicKey,
      widgetUrl: this.config.widgetUrl,
      debug: this.config.debug,
    });

    this.log('Initialized with config:', this.config);
  }

  private log(...args: unknown[]): void {
    if (this.config.debug) {
      console.log('[SoloPay]', ...args);
    }
  }

  /**
   * Open the payment widget. On PC opens a popup; on mobile redirects.
   * @param request Payment request parameters
   * @param mode Ignored on PC (always popup). On mobile: 'auto' | 'redirect' | 'iframe'
   * @param options onClose callback when the widget/popup is closed
   */
  requestPayment(
    request: PaymentRequest,
    mode?: RedirectMode,
    options?: RequestPaymentOptions
  ): void {
    // Validate request
    const validation = validatePaymentRequest(request);
    if (!validation.valid) {
      const errorMessages = Object.values(validation.errors).join(', ');
      throw new Error(`Invalid payment request: ${errorMessages}`);
    }

    this.log('Requesting payment:', request);

    const redirectMode = mode ?? this.config.redirectMode;

    this.widgetLauncher.open(request, redirectMode, {
      onClose: options?.onClose,
    });
  }

  /**
   * Get the widget URL for a payment request (useful for custom implementations)
   */
  getWidgetUrl(request: PaymentRequest): string {
    return this.widgetLauncher.buildWidgetUrl(request);
  }

  /** Close the payment popup if open. */
  closeWidget(): void {
    this.widgetLauncher.closeAll();
  }

  /** Destroy the SDK instance */
  destroy(): void {
    this.widgetLauncher.closeAll();
    this.log('SDK destroyed');
  }
}
