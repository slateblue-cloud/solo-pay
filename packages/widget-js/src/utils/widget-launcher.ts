import type { PaymentRequest } from '../types';
import { isMobile } from './dom';

const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 660;
const POPUP_POLL_MS = 300;

export interface WidgetLauncherConfig {
  publicKey: string;
  widgetUrl: string;
  debug?: boolean;
}

/** Widget launcher for opening payment widget */
export class WidgetLauncher {
  private publicKey: string;
  private widgetUrl: string;
  private debug: boolean;
  private onClose?: () => void;
  private popupWindow: Window | null = null;
  private popupCheckInterval: ReturnType<typeof setInterval> | null = null;
  private pendingFailUrl: string | null = null;

  constructor(config: WidgetLauncherConfig) {
    this.publicKey = config.publicKey;
    this.widgetUrl = config.widgetUrl.replace(/\/+$/, '');
    this.debug = config.debug ?? false;
  }

  private log(...args: unknown[]): void {
    if (this.debug) {
      console.log('[SoloPay]', ...args);
    }
  }

  /** Base URL for device: mobile → index (/), PC → /pc */
  private getBaseUrlForDevice(forMobile: boolean): string {
    return forMobile ? this.widgetUrl : `${this.widgetUrl}/pc`;
  }

  /** Build widget URL with payment parameters. Uses current device (mobile → /, PC → /pc) when forMobile is omitted. */
  buildWidgetUrl(request: PaymentRequest, forMobile?: boolean): string {
    const mobile = forMobile ?? isMobile();
    const baseUrl = this.getBaseUrlForDevice(mobile);
    const params = new URLSearchParams({
      pk: this.publicKey,
      orderId: request.orderId,
      amount: String(request.amount),
      tokenAddress: request.tokenAddress,
      successUrl: request.successUrl,
      failUrl: request.failUrl,
    });
    if (request.currency) {
      params.set('currency', request.currency);
    }
    if (request.locale === 'ko' || request.locale === 'en') {
      params.set('lang', request.locale);
    }

    const url = `${baseUrl}?${params.toString()}`;
    this.log('Built widget URL:', url, `(${mobile ? 'mobile' : 'pc'})`);
    return url;
  }

  /**
   * Open widget. On desktop opens a popup; on mobile redirects.
   * Call directly from a user gesture (e.g. click handler) so the browser allows the popup.
   */
  open(request: PaymentRequest, options?: { onClose?: () => void }): void {
    const mobile = isMobile();
    const url = this.buildWidgetUrl(request, mobile);

    this.log('Opening widget:', mobile ? 'redirect' : 'popup');
    this.onClose = options?.onClose;

    if (mobile) {
      this.openRedirect(url);
    } else {
      this.openPopup(url, request.failUrl);
    }
  }

  private openRedirect(url: string): void {
    this.log('Redirecting to widget:', url);
    window.location.href = url;
  }

  /**
   * Open widget in a popup window.
   * Uses a unique window name and explicit size/position so the browser opens a window rather than a tab.
   */
  private openPopup(url: string, failUrl: string): void {
    this.log('Opening popup:', url);
    this.closePopup();
    this.pendingFailUrl = failUrl;

    const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2);
    const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2);
    const features = `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`;

    const windowName = `solopay-widget-${Date.now()}`;
    this.popupWindow = window.open(url, windowName, features);
    if (!this.popupWindow) {
      this.pendingFailUrl = null;
      this.log('Popup blocked; falling back to redirect');
      this.openRedirect(url);
      return;
    }
    this.popupWindow.focus();

    const widgetOrigin = new URL(this.widgetUrl).origin;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== this.popupWindow) return;
      if (event.origin !== widgetOrigin) return;
      const data = event.data;
      if (
        !data ||
        typeof data !== 'object' ||
        (data.type !== 'payment_complete' && data.type !== 'wallet_connected')
      )
        return;

      this.log('Widget message:', data.type, data.status ?? '');
      window.removeEventListener('message', handleMessage);
      this.pendingFailUrl = null;
      if (this.popupWindow && !this.popupWindow.closed) {
        this.popupWindow.close();
      }
      this.clearPopupCheck();
      this.handleClose();

      // Redirect opener to success/fail URL so merchant page shows result
      if (data.type === 'payment_complete') {
        if (data.status === 'success' && typeof data.successUrl === 'string') {
          window.location.href = data.successUrl;
        } else if (data.status === 'fail' && typeof data.failUrl === 'string') {
          window.location.href = data.failUrl;
        }
      } else if (data.type === 'wallet_connected' && typeof data.successUrl === 'string') {
        window.location.href = data.successUrl;
      }
    };
    window.addEventListener('message', handleMessage);

    this.popupCheckInterval = setInterval(() => {
      if (this.popupWindow?.closed) {
        window.removeEventListener('message', handleMessage);
        const failUrl = this.pendingFailUrl;
        this.clearPopupCheck();
        this.pendingFailUrl = null;
        this.handleClose();
        if (failUrl) {
          window.location.href = failUrl;
        }
      }
    }, POPUP_POLL_MS);
  }

  private clearPopupCheck(): void {
    if (this.popupCheckInterval !== null) {
      clearInterval(this.popupCheckInterval);
      this.popupCheckInterval = null;
    }
    this.popupWindow = null;
  }

  private closePopup(): void {
    if (this.popupWindow && !this.popupWindow.closed) {
      this.popupWindow.close();
    }
    this.pendingFailUrl = null;
    this.clearPopupCheck();
  }

  /** Handle widget close */
  private handleClose(): void {
    this.log('Widget closed');
    this.onClose?.();
    this.onClose = undefined;
  }

  /** Close the popup window if open. */
  closeAll(): void {
    this.closePopup();
  }
}
