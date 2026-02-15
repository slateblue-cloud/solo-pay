/**
 * Basic health checks — verify services are running before payment tests.
 */

import { test, expect } from '@playwright/test';
import { DEMO_URL, GATEWAY_URL, RPC_URL } from '../helpers/constants';

test.describe('Service Health Checks', () => {
  test('demo app is accessible', async ({ page }) => {
    const response = await page.goto(DEMO_URL);
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toContainText('Solo Pay Demo');
  });

  test('gateway API is accessible', async ({ request }) => {
    const response = await request.get(`${GATEWAY_URL}/health`);
    expect(response.ok()).toBeTruthy();
  });

  test('hardhat node is accessible', async ({ request }) => {
    const response = await request.post(RPC_URL, {
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_chainId',
        params: [],
      },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.result).toBe('0x7a69'); // 31337
  });

  test('demo /api/config returns correct chain config', async ({ request }) => {
    const response = await request.get(`${DEMO_URL}/api/config`);
    expect(response.ok()).toBeTruthy();
    const config = await response.json();
    expect(config.chainId).toBe(31337);
    expect(config.chainName).toBe('Hardhat');
  });
});
