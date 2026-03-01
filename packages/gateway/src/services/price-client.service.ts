import { createLogger } from '../lib/logger';

export interface TokenPriceResult {
  price: number;
  symbol: string;
  name: string;
}

/**
 * HTTP client for price-service.
 * Follows the same native fetch pattern as RelayerService.
 */
export class PriceClient {
  private readonly baseUrl: string;
  private readonly logger = createLogger('PriceClient');

  constructor(apiUrl: string) {
    if (!apiUrl) {
      throw new Error('Price service URL is required');
    }
    this.baseUrl = apiUrl.replace(/\/$/, '');
  }

  /**
   * Get token price in the specified fiat currency.
   *
   * Calls: GET {baseUrl}/api/v1/prices/{chainId}/{tokenAddress}?convert={convert}
   */
  async getTokenPrice(
    chainId: number,
    tokenAddress: string,
    convert: string
  ): Promise<TokenPriceResult> {
    const url = `${this.baseUrl}/api/v1/prices/${chainId}/${tokenAddress}?convert=${encodeURIComponent(convert)}`;

    this.logger.info({ chainId, tokenAddress, convert }, 'Fetching token price');

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      const message = errorData.message || `Price service HTTP ${response.status}`;
      this.logger.error({ chainId, tokenAddress, convert, status: response.status }, message);
      throw new Error(message);
    }

    const body = (await response.json()) as {
      data: {
        name: string;
        symbol: string;
        quote: Record<string, { price: number }>;
      };
    };

    const quote = body.data.quote[convert];
    if (!quote || typeof quote.price !== 'number' || quote.price <= 0) {
      throw new Error(`Invalid price data for ${convert}`);
    }

    return {
      price: quote.price,
      symbol: body.data.symbol,
      name: body.data.name,
    };
  }
}
