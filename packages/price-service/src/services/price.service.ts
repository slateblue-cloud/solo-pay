import { PrismaClient } from '@solo-pay/database';
import { createLogger } from '../lib/logger';
import { getCache, setCache } from '../lib/redis';

const logger = createLogger('PriceService');

const CMC_API_BASE = 'https://pro-api.coinmarketcap.com';

export interface TokenQuote {
  price: number;
  volume_24h: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  market_cap: number;
  last_updated: string;
}

export interface TokenPriceResult {
  id: number;
  name: string;
  symbol: string;
  address: string;
  chain_id: number;
  quote: Record<string, TokenQuote>;
}

interface CmcQuoteResponse {
  status: {
    error_code: number;
    error_message: string | null;
    credit_count: number;
  };
  data: Record<
    string,
    {
      id: number;
      name: string;
      symbol: string;
      quote: Record<
        string,
        {
          price: number;
          volume_24h: number;
          percent_change_1h: number;
          percent_change_24h: number;
          percent_change_7d: number;
          market_cap: number;
          last_updated: string;
        }
      >;
    }
  >;
}

export interface PriceServiceConfig {
  apiKey: string;
  cacheTtl: number;
}

export class PriceService {
  private readonly apiKey: string;
  private readonly cacheTtl: number;
  private readonly prisma: PrismaClient;

  constructor(config: PriceServiceConfig, prisma: PrismaClient) {
    this.apiKey = config.apiKey;
    this.cacheTtl = config.cacheTtl;
    this.prisma = prisma;
  }

  async getPrice(
    chainId: number,
    address: string,
    convert: string = 'USD'
  ): Promise<TokenPriceResult> {
    const cacheKey = `price:${chainId}:${address}:${convert}`;

    const cached = await getCache(cacheKey);
    if (cached) {
      logger.debug({ chainId, address, convert }, 'Cache hit');
      return JSON.parse(cached);
    }

    logger.debug({ chainId, address, convert }, 'Cache miss, looking up token');

    const chain = await this.prisma.chain.findUnique({
      where: { network_id: chainId },
    });

    if (!chain) {
      throw new TokenNotFoundError(`Chain not found: ${chainId}`);
    }

    const token = await this.prisma.token.findUnique({
      where: {
        chain_id_address: { chain_id: chain.id, address },
      },
    });

    if (!token) {
      throw new TokenNotFoundError(`Token not found: ${chainId}:${address}`);
    }

    if (!token.is_enabled || token.is_deleted) {
      throw new TokenNotFoundError(`Token is disabled: ${chainId}:${address}`);
    }

    if (!token.cmc_slug) {
      throw new CmcIdMissingError(`CMC slug not set for token: ${token.symbol} (${address})`);
    }

    const cmcData = await this.fetchCmcBySlug(token.cmc_slug, convert);
    const cmcToken = Object.values(cmcData.data)[0];

    if (!cmcToken) {
      throw new Error(`CMC returned no data for slug: ${token.cmc_slug}`);
    }

    const quote: Record<string, TokenQuote> = {};
    for (const [currency, q] of Object.entries(cmcToken.quote)) {
      quote[currency] = {
        price: q.price,
        volume_24h: q.volume_24h,
        percent_change_1h: q.percent_change_1h,
        percent_change_24h: q.percent_change_24h,
        percent_change_7d: q.percent_change_7d,
        market_cap: q.market_cap,
        last_updated: q.last_updated,
      };
    }

    const result: TokenPriceResult = {
      id: cmcToken.id,
      name: cmcToken.name,
      symbol: cmcToken.symbol,
      address,
      chain_id: chainId,
      quote,
    };

    await setCache(cacheKey, JSON.stringify(result), this.cacheTtl);
    return result;
  }

  private async fetchCmcBySlug(slug: string, convert: string): Promise<CmcQuoteResponse> {
    const params = new URLSearchParams({
      slug,
      convert,
    });

    const url = `${CMC_API_BASE}/v2/cryptocurrency/quotes/latest?${params}`;

    const response = await fetch(url, {
      headers: {
        'X-CMC_PRO_API_KEY': this.apiKey,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error({ status: response.status, body }, 'CMC API request failed');
      throw new Error(`CMC API error: ${response.status}`);
    }

    const data = (await response.json()) as CmcQuoteResponse;

    if (data.status.error_code !== 0) {
      logger.error({ error: data.status.error_message }, 'CMC API returned error');
      throw new Error(`CMC API error: ${data.status.error_message}`);
    }

    logger.debug({ credits: data.status.credit_count }, 'CMC API call completed');
    return data;
  }
}

export class TokenNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenNotFoundError';
  }
}

export class CmcIdMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CmcIdMissingError';
  }
}
