#!/usr/bin/env tsx
/**
 * API Stress Test Runner
 *
 * Runs payment stress tests using accounts from accounts.json.
 * The number of tests equals the number of accounts in accounts.json.
 *
 * Usage:
 *   pnpm execute:api [options]
 *
 * Examples:
 *   pnpm execute:api                       # Test with all accounts in accounts.json
 *   pnpm execute:api --network=amoy        # Test on Amoy testnet
 *   pnpm execute:api --concurrency=20      # 20 parallel requests
 *   pnpm execute:api --amount=50           # 50 tokens per payment
 *
 * Prerequisites:
 *   pnpm accounts:generate 100             # Generate 100 accounts
 *   pnpm accounts:fund                     # Fund accounts with tokens
 */

import { getNetworkConfig } from '../../config';
import { loadAccounts } from '../account-manager';
import { executePaymentsParallel, type PaymentResult } from './payment';

const DEFAULT_TEST_CONFIG = {
  paymentAmount: '10',
  concurrency: 10,
};

interface CliOptions {
  network: string;
  concurrency: number;
  amount: string;
  count?: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  const options: CliOptions = {
    network: 'hardhat',
    concurrency: DEFAULT_TEST_CONFIG.concurrency,
    amount: DEFAULT_TEST_CONFIG.paymentAmount,
  };

  for (const arg of args) {
    if (arg.startsWith('--network=')) {
      options.network = arg.split('=')[1];
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--amount=')) {
      options.amount = arg.split('=')[1];
    } else if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1], 10);
    } else if (/^\d+$/.test(arg)) {
      // Support positional argument for count (e.g. "execute:api 10")
      options.count = parseInt(arg, 10);
    }
  }

  return options;
}

function printHeader(options: CliOptions, accountCount: number) {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║              API STRESS TEST - Solo Pay                  ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Accounts:     ${accountCount.toString().padEnd(42)}║`);
  console.log(`║  Network:      ${options.network.padEnd(42)}║`);
  console.log(`║  Concurrency:  ${options.concurrency.toString().padEnd(42)}║`);
  console.log(`║  Amount:       ${(options.amount + ' tokens').padEnd(42)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝\n');
}

function printProgress(phase: string, current: number, total: number) {
  const percent = Math.round((current / total) * 100);
  const bar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
  process.stdout.write(`\r${phase}: [${bar}] ${percent}% (${current}/${total})`);
}

function printSummary(results: PaymentResult[], durationMs: number) {
  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const successRate = (successful.length / results.length) * 100;

  const durations = successful.map((r) => r.durationMs);
  const avgDuration =
    durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  const minDuration = durations.length > 0 ? Math.min(...durations) : 0;
  const maxDuration = durations.length > 0 ? Math.max(...durations) : 0;

  // Step breakdown
  const createDurations = successful
    .filter((r) => r.steps.createPayment?.success)
    .map((r) => r.steps.createPayment!.durationMs);
  const approveDurations = successful
    .filter((r) => r.steps.approve?.success)
    .map((r) => r.steps.approve!.durationMs);
  const relayDurations = successful
    .filter((r) => r.steps.signAndRelay?.success)
    .map((r) => r.steps.signAndRelay!.durationMs);
  const confirmDurations = successful
    .filter((r) => r.steps.confirm?.success)
    .map((r) => r.steps.confirm!.durationMs);

  const avgCreate =
    createDurations.length > 0
      ? createDurations.reduce((a, b) => a + b, 0) / createDurations.length
      : 0;
  const avgApprove =
    approveDurations.length > 0
      ? approveDurations.reduce((a, b) => a + b, 0) / approveDurations.length
      : 0;
  const avgRelay =
    relayDurations.length > 0
      ? relayDurations.reduce((a, b) => a + b, 0) / relayDurations.length
      : 0;
  const avgConfirm =
    confirmDurations.length > 0
      ? confirmDurations.reduce((a, b) => a + b, 0) / confirmDurations.length
      : 0;
  const minConfirm = confirmDurations.length > 0 ? Math.min(...confirmDurations) : 0;
  const maxConfirm = confirmDurations.length > 0 ? Math.max(...confirmDurations) : 0;

  console.log('\n\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                  STRESS TEST RESULTS                     ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Total Requests:     ${results.length.toString().padEnd(36)}║`);
  console.log(`║  Successful:         ${successful.length.toString().padEnd(36)}║`);
  console.log(`║  Failed:             ${failed.length.toString().padEnd(36)}║`);
  console.log(`║  Success Rate:       ${successRate.toFixed(2).padEnd(35)}%║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Duration (ms):                                          ║');
  console.log(`║    Total:            ${durationMs.toString().padEnd(36)}║`);
  console.log(`║    Avg per request:  ${avgDuration.toFixed(0).padEnd(36)}║`);
  console.log(`║    Min:              ${minDuration.toString().padEnd(36)}║`);
  console.log(`║    Max:              ${maxDuration.toString().padEnd(36)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Step Breakdown (avg ms):                                ║');
  console.log(`║    Create Payment:   ${avgCreate.toFixed(0).padEnd(36)}║`);
  console.log(`║    Approve Token:    ${avgApprove.toFixed(0).padEnd(36)}║`);
  console.log(`║    Sign & Relay:     ${avgRelay.toFixed(0).padEnd(36)}║`);
  console.log(`║    Confirm (on-chain):${avgConfirm.toFixed(0).padEnd(35)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║  Confirmation Time (ms):                                 ║');
  console.log(`║    Avg:              ${avgConfirm.toFixed(0).padEnd(36)}║`);
  console.log(`║    Min:              ${minConfirm.toString().padEnd(36)}║`);
  console.log(`║    Max:              ${maxConfirm.toString().padEnd(36)}║`);
  // Count confirm failures among relay-successful results
  const relaySuccessful = results.filter((r) => r.steps.signAndRelay?.success);
  const confirmFailed = relaySuccessful.filter((r) => r.steps.confirm && !r.steps.confirm.success);
  if (confirmFailed.length > 0) {
    console.log('╠══════════════════════════════════════════════════════════╣');
    console.log(`║  Confirm Failures:   ${confirmFailed.length.toString().padEnd(36)}║`);
    const statusCounts: Record<string, number> = {};
    confirmFailed.forEach((r) => {
      const s = r.steps.confirm?.finalStatus || 'UNKNOWN';
      statusCounts[s] = (statusCounts[s] || 0) + 1;
    });
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`║    ${status}: ${count.toString().padEnd(40)}║`);
    });
  }
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (failed.length > 0) {
    console.log('\n┌─────────────────────────────────────────────────────────┐');
    console.log('│  ERRORS (first 5):                                      │');
    console.log('├─────────────────────────────────────────────────────────┤');
    failed.slice(0, 5).forEach((r) => {
      const shortError = r.error?.slice(0, 50) || 'Unknown';
      console.log(`│  Wallet ${r.walletIndex}: ${shortError.padEnd(43)}│`);
    });
    console.log('└─────────────────────────────────────────────────────────┘');
  }

  // Throughput
  const throughput = (successful.length / (durationMs / 1000)).toFixed(2);
  console.log(`\n📊 Throughput: ${throughput} successful payments/second`);
}

async function main() {
  const options = parseArgs();
  const config = getNetworkConfig(options.network);

  // Load wallets from accounts.json
  console.log('Loading accounts from accounts.json...');
  const stored = loadAccounts();
  if (!stored) {
    console.error('No stored accounts found. Run "pnpm accounts:generate" first.');
    process.exit(1);
  }
  if (stored.network !== options.network) {
    console.error(`Stored accounts are for ${stored.network}, not ${options.network}`);
    process.exit(1);
  }

  // Use all accounts or limit by count option
  const wallets = options.count ? stored.accounts.slice(0, options.count) : stored.accounts;

  options.concurrency = Math.min(options.concurrency, wallets.length);

  printHeader(options, wallets.length);

  console.log(`Loaded ${wallets.length} wallets from accounts.json`);
  console.log(`   First: ${wallets[0].address}`);
  console.log(`   Last:  ${wallets[wallets.length - 1].address}`);

  // Execute Payments
  console.log('\nExecuting payments...');
  const startTime = Date.now();

  const results = await executePaymentsParallel(
    wallets,
    config,
    options.amount,
    options.concurrency,
    (done, total) => {
      printProgress('Payments', done, total);
    }
  );

  const totalDuration = Date.now() - startTime;

  printSummary(results, totalDuration);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
