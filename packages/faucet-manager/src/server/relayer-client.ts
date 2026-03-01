/**
 * Relayer API client: sends native token via POST /api/v1/relay/direct.
 * Compatible with simple-relayer (sync 200) and solo-relayer-service (async 202 + poll status).
 */

import type { SendNative } from '../ports';

const API_V1 = '/api/v1';
const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;
const DIRECT_REQUEST_TIMEOUT_MS = 30_000;
const STATUS_REQUEST_TIMEOUT_MS = 10_000;

const ETH_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

interface DirectResponse {
  transactionId?: string;
  transactionHash?: string;
  status?: string;
  error?: string;
  message?: string;
}

interface StatusResponse {
  transactionId: string;
  transactionHash?: string | null;
  status: string;
}

function buildBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

function getHeaders(apiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  return headers;
}

export interface RelayerConfigForChain {
  baseUrl: string;
  apiKey?: string;
}

/**
 * Creates a SendNative implementation that uses the relayer API (direct transfer).
 * Config per chain is resolved via getConfigForChain (e.g. from DB chains.relayer_url, like gateway).
 */
export function createSendNativeViaRelayer(
  getConfigForChain: (chainId: number) => Promise<RelayerConfigForChain>
): SendNative {
  return async function sendNative(
    chainId: number,
    toAddress: string,
    amountWei: bigint
  ): Promise<string> {
    const config = await getConfigForChain(chainId);
    if (!config?.baseUrl) {
      throw new Error(`No relayer URL configured for chain ${chainId}`);
    }
    const baseUrl = buildBaseUrl(config.baseUrl);
    const relayApiKey = config.apiKey;

    if (!ETH_ADDRESS_REGEX.test(toAddress)) {
      throw new Error('Invalid toAddress: must be 0x-prefixed 40 hex chars');
    }
    if (amountWei <= 0n) {
      throw new Error('amountWei must be positive');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DIRECT_REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${API_V1}/relay/direct`, {
        method: 'POST',
        headers: getHeaders(relayApiKey),
        body: JSON.stringify({
          to: toAddress,
          data: '0x',
          value: amountWei.toString(),
        }),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Relayer direct request timeout');
      }
      throw err;
    }
    clearTimeout(timeoutId);

    const body = (await res.json().catch(() => ({}))) as DirectResponse;

    if (!res.ok) {
      const msg = body.message ?? body.error ?? `Relayer API error: ${res.status}`;
      throw new Error(msg);
    }

    // Sync response (e.g. simple-relayer): 200 with transactionHash
    if (res.status === 200 && body.transactionHash) {
      return body.transactionHash;
    }

    // Async response (e.g. solo-relayer-service): 202 with transactionId; poll for hash
    if ((res.status === 200 || res.status === 202) && body.transactionId) {
      const hash = await pollTransactionStatus(
        baseUrl,
        body.transactionId,
        getHeaders(relayApiKey ?? undefined)
      );
      return hash;
    }

    throw new Error('Relayer API returned no transaction hash or id');
  };
}

async function pollTransactionStatus(
  baseUrl: string,
  transactionId: string,
  headers: Record<string, string>
): Promise<string> {
  const deadline = Date.now() + DEFAULT_POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), STATUS_REQUEST_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(`${baseUrl}${API_V1}/relay/status/${transactionId}`, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Status poll timeout for transaction ${transactionId}`);
      }
      throw err;
    }
    clearTimeout(timeoutId);

    if (res.status === 404) {
      throw new Error(`Transaction not found: ${transactionId}`);
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(body.message ?? `Status check failed: ${res.status}`);
    }

    const body = (await res.json().catch(() => ({}))) as StatusResponse;
    if (body.status === 'failed') {
      throw new Error(`Relay transaction failed: ${transactionId}`);
    }
    if (body.transactionHash) {
      return body.transactionHash;
    }

    await sleep(DEFAULT_POLL_INTERVAL_MS);
  }

  throw new Error(`Timeout waiting for transaction ${transactionId}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
