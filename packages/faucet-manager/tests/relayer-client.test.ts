import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSendNativeViaRelayer } from '../src/server/relayer-client';

const BASE_URL = 'http://relayer:3001';

// Helper: returns same config for any chain (tests don't need per-chain config)
const getConfigForChain =
  (baseUrl: string, apiKey?: string) =>
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature requires chainId
  (chainId: number) =>
    Promise.resolve({ baseUrl, apiKey } as { baseUrl: string; apiKey?: string });

describe('createSendNativeViaRelayer', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns transactionHash when relayer responds 200 with hash (sync)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          transactionId: 'tx-1',
          transactionHash: '0xabc123',
          status: 'sent',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL));
    const hash = await sendNative(31337, '0x' + 'aa'.repeat(20), 48_000n);

    expect(hash).toBe('0xabc123');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/api/v1/relay/direct`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          to: '0x' + 'aa'.repeat(20),
          data: '0x',
          value: '48000',
        }),
      })
    );
  });

  it('polls status when relayer responds 202 with transactionId (async)', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: () =>
          Promise.resolve({
            transactionId: 'tx-async-1',
            status: 'pending',
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            transactionId: 'tx-async-1',
            transactionHash: '0xdef456',
            status: 'confirmed',
          }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL));
    const hash = await sendNative(31337, '0x' + 'bb'.repeat(20), 100_000n);

    expect(hash).toBe('0xdef456');
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      `${BASE_URL}/api/v1/relay/direct`,
      expect.any(Object)
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      `${BASE_URL}/api/v1/relay/status/tx-async-1`,
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('includes x-api-key header when apiKey is provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          transactionHash: '0xkeyed',
          status: 'sent',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL, 'secret-key'));
    await sendNative(31337, '0x' + 'cc'.repeat(20), 1n);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-api-key': 'secret-key',
        }),
      })
    );
  });

  it('throws when relayer returns non-ok', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ message: 'Internal error' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL));

    await expect(sendNative(31337, '0x' + 'dd'.repeat(20), 1n)).rejects.toThrow('Internal error');
  });

  it('throws when no relayer URL configured for chain', async () => {
    const getConfig = () => Promise.resolve({ baseUrl: '' });
    const sendNative = createSendNativeViaRelayer(getConfig);

    await expect(sendNative(31337, '0x' + 'aa'.repeat(20), 1n)).rejects.toThrow(
      'No relayer URL configured for chain 31337'
    );
  });

  it('throws when toAddress is invalid', async () => {
    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL));

    await expect(sendNative(31337, 'invalid', 1n)).rejects.toThrow('Invalid toAddress');
  });

  it('throws when amountWei is zero or negative', async () => {
    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL));

    await expect(sendNative(31337, '0x' + 'aa'.repeat(20), 0n)).rejects.toThrow(
      'amountWei must be positive'
    );

    await expect(sendNative(31337, '0x' + 'aa'.repeat(20), -1n)).rejects.toThrow(
      'amountWei must be positive'
    );
  });

  it('strips trailing slash from relayApiUrl', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          transactionHash: '0xslash',
          status: 'sent',
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const sendNative = createSendNativeViaRelayer(getConfigForChain(BASE_URL + '/'));
    await sendNative(31337, '0x' + 'ee'.repeat(20), 1n);

    expect(mockFetch).toHaveBeenCalledWith(`${BASE_URL}/api/v1/relay/direct`, expect.any(Object));
  });
});
