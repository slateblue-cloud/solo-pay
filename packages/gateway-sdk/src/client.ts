import { API_URLS, DEFAULT_HEADERS } from './constants';
import { SoloPayError } from './errors';
import type {
  SoloPayConfig,
  CreatePaymentParams,
  CreatePaymentResponse,
  PaymentStatusResponse,
  GaslessParams,
  GaslessResponse,
  RelayStatusResponse,
  MerchantInfoResponse,
  PaymentMethodListResponse,
  CreatePaymentMethodParams,
  CreatePaymentMethodResponse,
  UpdatePaymentMethodParams,
  UpdatePaymentMethodResponse,
  DeletePaymentMethodResponse,
  MerchantPaymentDetailResponse,
  CreateRefundParams,
  CreateRefundResponse,
  RefundStatusResponse,
  GetRefundListParams,
  RefundListResponse,
  ChainsResponse,
  ChainsWithTokensResponse,
  ErrorResponse,
} from './types';

export class SoloPayClient {
  private apiUrl: string;
  private apiKey: string;
  private publicKey?: string;
  private origin?: string;

  constructor(config: SoloPayConfig) {
    this.apiKey = config.apiKey;
    this.publicKey = config.publicKey;
    this.origin = config.origin;

    if (config.environment === 'custom') {
      if (!config.apiUrl) {
        throw new Error('apiUrl is required when environment is "custom"');
      }
      this.apiUrl = config.apiUrl;
    } else {
      this.apiUrl = API_URLS[config.environment];
    }
  }

  setApiUrl(url: string): void {
    this.apiUrl = url;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  // ==========================================================================
  // Payment endpoints (public-key + Origin auth)
  // ==========================================================================

  /** POST /payments — Create a payment */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResponse> {
    return this.requestWithPublicKey<CreatePaymentResponse>('POST', '/payments', params);
  }

  /** GET /payments/:id — Get payment status */
  async getPaymentStatus(paymentId: string): Promise<PaymentStatusResponse> {
    return this.request<PaymentStatusResponse>(
      'GET',
      `/payments/${paymentId}`,
      undefined,
      'public'
    );
  }

  /** POST /payments/:id/relay — Submit gasless relay request */
  async submitGasless(params: GaslessParams): Promise<GaslessResponse> {
    return this.request<GaslessResponse>(
      'POST',
      `/payments/${params.paymentId}/relay`,
      params,
      'public'
    );
  }

  /** GET /payments/:id/relay — Get relay transaction status */
  async getRelayStatus(paymentId: string): Promise<RelayStatusResponse> {
    return this.request<RelayStatusResponse>(
      'GET',
      `/payments/${paymentId}/relay`,
      undefined,
      'public'
    );
  }

  // ==========================================================================
  // Merchant endpoints (x-api-key auth)
  // ==========================================================================

  /** GET /merchant — Get current merchant info */
  async getMerchantInfo(): Promise<MerchantInfoResponse> {
    return this.request<MerchantInfoResponse>('GET', '/merchant');
  }

  /** GET /merchant/payment-methods — List payment methods */
  async getPaymentMethods(): Promise<PaymentMethodListResponse> {
    return this.request<PaymentMethodListResponse>('GET', '/merchant/payment-methods');
  }

  /** POST /merchant/payment-methods — Create payment method */
  async createPaymentMethod(
    params: CreatePaymentMethodParams
  ): Promise<CreatePaymentMethodResponse> {
    return this.request<CreatePaymentMethodResponse>(
      'POST',
      '/merchant/payment-methods',
      params as unknown as Record<string, unknown>
    );
  }

  /** PATCH /merchant/payment-methods/:id — Update payment method */
  async updatePaymentMethod(
    id: number,
    params: UpdatePaymentMethodParams
  ): Promise<UpdatePaymentMethodResponse> {
    return this.request<UpdatePaymentMethodResponse>(
      'PATCH',
      `/merchant/payment-methods/${id}`,
      params as unknown as Record<string, unknown>
    );
  }

  /** DELETE /merchant/payment-methods/:id — Delete payment method */
  async deletePaymentMethod(id: number): Promise<DeletePaymentMethodResponse> {
    return this.request<DeletePaymentMethodResponse>('DELETE', `/merchant/payment-methods/${id}`);
  }

  /** GET /merchant/payments?orderId=xxx — Get merchant payment by order ID */
  async getMerchantPaymentByOrderId(orderId: string): Promise<MerchantPaymentDetailResponse> {
    return this.request<MerchantPaymentDetailResponse>(
      'GET',
      `/merchant/payments?orderId=${encodeURIComponent(orderId)}`
    );
  }

  /** GET /merchant/payments/:id — Get merchant payment by payment hash */
  async getMerchantPaymentById(paymentId: string): Promise<MerchantPaymentDetailResponse> {
    return this.request<MerchantPaymentDetailResponse>('GET', `/merchant/payments/${paymentId}`);
  }

  // ==========================================================================
  // Refund endpoints (x-api-key auth)
  // ==========================================================================

  /** POST /refunds — Create a refund */
  async createRefund(params: CreateRefundParams): Promise<CreateRefundResponse> {
    return this.request<CreateRefundResponse>(
      'POST',
      '/refunds',
      params as unknown as Record<string, unknown>
    );
  }

  /** GET /refunds/:refundId — Get refund status */
  async getRefundStatus(refundId: string): Promise<RefundStatusResponse> {
    return this.request<RefundStatusResponse>('GET', `/refunds/${refundId}`);
  }

  /** GET /refunds — List refunds */
  async getRefundList(params?: GetRefundListParams): Promise<RefundListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.page !== undefined) queryParams.set('page', params.page.toString());
    if (params?.limit !== undefined) queryParams.set('limit', params.limit.toString());
    if (params?.status) queryParams.set('status', params.status);
    if (params?.paymentId) queryParams.set('paymentId', params.paymentId);
    const qs = queryParams.toString();
    return this.request<RefundListResponse>('GET', `/refunds${qs ? `?${qs}` : ''}`);
  }

  // ==========================================================================
  // Chain endpoints (no auth)
  // ==========================================================================

  /** GET /chains — Get all available chains */
  async getChains(): Promise<ChainsResponse> {
    return this.request<ChainsResponse>('GET', '/chains', undefined, 'none');
  }

  /** GET /chains/tokens — Get all chains with their tokens */
  async getChainsWithTokens(): Promise<ChainsWithTokensResponse> {
    return this.request<ChainsWithTokensResponse>('GET', '/chains/tokens', undefined, 'none');
  }

  // ==========================================================================
  // Internal request helpers
  // ==========================================================================

  private async request<T>(
    method: string,
    path: string,
    body?: Record<string, unknown> | GaslessParams,
    auth: 'api' | 'public' | 'none' = 'api'
  ): Promise<T> {
    const headers: Record<string, string> = { ...DEFAULT_HEADERS };
    if (auth === 'public' && this.publicKey) {
      headers['x-public-key'] = this.publicKey;
      if (this.origin) {
        headers['origin'] = this.origin;
      }
    } else if (auth !== 'none') {
      // Fallback to API key auth for 'api' or 'public' without publicKey configured
      headers['x-api-key'] = this.apiKey;
    }

    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    const data = (await response.json()) as T | ErrorResponse;

    if (!response.ok) {
      const error = data as ErrorResponse;
      const statusCode = response.status;
      throw new SoloPayError(error.code, error.message, statusCode, error.details);
    }

    return data as T;
  }

  private async requestWithPublicKey<T>(
    method: string,
    path: string,
    body?: CreatePaymentParams
  ): Promise<T> {
    if (!this.publicKey || !this.origin) {
      throw new Error(
        'requestWithPublicKey requires publicKey and origin in SoloPayConfig (for POST /payments auth)'
      );
    }
    const headers = {
      ...DEFAULT_HEADERS,
      'x-public-key': this.publicKey,
      Origin: this.origin,
    };

    const response = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });

    const data = (await response.json()) as T | ErrorResponse;

    if (!response.ok) {
      const error = data as ErrorResponse;
      throw new SoloPayError(error.code, error.message, response.status, error.details);
    }

    return data as T;
  }
}
