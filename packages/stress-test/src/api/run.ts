#!/usr/bin/env tsx
/**
 * API Stress Test Runner
 *
 * One-time per run: generate N accounts, fund, run N payments. No reuse; each run uses fresh accounts.
 *
 * Usage:
 *   pnpm execute:api [count] [options]
 *   pnpm execute:api 10 --amount=10 --network=amoy
 *   pnpm execute:api 100000 --workers=20   # 100k in-flight across 20 processes
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { getNetworkConfig } from '../../config';
import { setupAccountsForRun } from '../ensure-accounts';
import { getAccountsRange, type TestAccount } from '../account-manager';
import { executePaymentsParallel, type PaymentResult } from './payment';

const DEFAULT_TEST_CONFIG = {
  paymentAmount: '1',
  concurrency: 10,
};

interface CliOptions {
  network: string;
  concurrency: number;
  amount: string;
  fundAmount: string;
  count?: number;
  /** Number of worker processes; each runs its chunk with full concurrency. Total in-flight ≈ (count/workers) * workers = count. */
  workers: number;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);

  const options: CliOptions = {
    network: 'hardhat',
    concurrency: DEFAULT_TEST_CONFIG.concurrency,
    amount: DEFAULT_TEST_CONFIG.paymentAmount,
    fundAmount: '', // default: same as amount (set below)
    workers: 1,
  };

  for (const arg of args) {
    if (arg.startsWith('--network=')) {
      options.network = arg.split('=')[1];
    } else if (arg.startsWith('--workers=')) {
      options.workers = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--concurrency=')) {
      options.concurrency = parseInt(arg.split('=')[1], 10);
    } else if (arg.startsWith('--amount=')) {
      options.amount = arg.split('=')[1];
    } else if (arg.startsWith('--fund-amount=')) {
      options.fundAmount = arg.split('=')[1];
    } else if (arg.startsWith('--count=')) {
      options.count = parseInt(arg.split('=')[1], 10);
    } else if (/^\d+$/.test(arg)) {
      options.count = parseInt(arg, 10);
    }
  }

  // Default fund-amount to amount so each account gets exactly enough for one payment (tokens used up)
  if (!options.fundAmount) {
    options.fundAmount = options.amount;
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

  // Throughput
  const throughput = (successful.length / (durationMs / 1000)).toFixed(2);
  console.log(`\n📊 Throughput: ${throughput} successful payments/second`);
}

/** Run as worker: derive wallets for [start,end), run all in parallel, write results to file. */
async function workerMain(): Promise<void> {
  const start = parseInt(process.env.STRESS_START_INDEX!, 10);
  const end = parseInt(process.env.STRESS_END_INDEX!, 10);
  const network = process.env.STRESS_NETWORK!;
  const amount = process.env.STRESS_AMOUNT!;
  const resultsFile = process.env.STRESS_RESULTS_FILE!;
  const config = getNetworkConfig(network);
  const wallets = getAccountsRange(start, end);
  const results = await executePaymentsParallel(wallets, config, amount, wallets.length);
  writeFileSync(resultsFile, JSON.stringify(results), 'utf8');
}

async function main() {
  if (process.env.STRESS_WORKER === '1') {
    await workerMain();
    return;
  }

  const options = parseArgs();
  const config = getNetworkConfig(options.network);
  const count = options.count ?? 10;
  const workers = Math.max(1, options.workers);

  const wallets = await setupAccountsForRun(count, options.network, options.fundAmount, {
    onFundProgress: (current, total) => printProgress('Funding', current, total),
  });

  if (workers > 1) {
    const chunkSize = Math.ceil(count / workers);
    const startTime = Date.now();
    const scriptRel = 'src/api/run.ts';
    const resultFiles: string[] = [];

    printHeader({ ...options, concurrency: count }, count);
    console.log(
      `Using ${count} wallet(s) across ${workers} worker(s) (≈ ${Math.min(chunkSize, count)} in-flight per worker)\n`
    );
    console.log('Executing payments (workers)...\n');

    await Promise.all(
      Array.from({ length: workers }, (_, w) => {
        const start = w * chunkSize;
        const end = Math.min(start + chunkSize, count);
        if (start >= end) return Promise.resolve();
        const outFile = join(tmpdir(), `solo-stress-results-${process.pid}-${w}.json`);
        resultFiles.push(outFile);
        return new Promise<void>((resolve, reject) => {
          const child = spawn('pnpm', ['exec', 'tsx', scriptRel], {
            env: {
              ...process.env,
              STRESS_WORKER: '1',
              STRESS_START_INDEX: String(start),
              STRESS_END_INDEX: String(end),
              STRESS_NETWORK: options.network,
              STRESS_AMOUNT: options.amount,
              STRESS_RESULTS_FILE: outFile,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: join(fileURLToPath(new URL('.', import.meta.url)), '../..'),
          });
          let stderr = '';
          child.stderr?.on('data', (d) => (stderr += d.toString()));
          child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Worker ${w} exit ${code}: ${stderr.slice(-500)}`));
          });
        });
      })
    );

    const results: PaymentResult[] = [];
    for (const f of resultFiles) {
      const data = readFileSync(f, 'utf8');
      results.push(...(JSON.parse(data) as PaymentResult[]));
    }
    results.sort((a, b) => a.walletIndex - b.walletIndex);
    printSummary(results, Date.now() - startTime);
    return;
  }

  if (options.concurrency <= 0) {
    options.concurrency = wallets.length;
  }
  options.concurrency = Math.min(options.concurrency, wallets.length);

  printHeader(options, wallets.length);
  console.log(`Using ${wallets.length} wallet(s)`);
  console.log(`   First: ${wallets[0].address}`);
  console.log(`   Last:  ${wallets[wallets.length - 1].address}`);

  console.log('\nExecuting payments...\n');
  printProgress('Payments', 0, wallets.length);
  const startTime = Date.now();
  const errors: string[] = [];
  const results = await executePaymentsParallel(
    wallets,
    config,
    options.amount,
    options.concurrency,
    (done, total, result) => {
      if (result && !result.success) {
        errors.push(`  Wallet ${result.walletIndex}: ${(result.error || 'Unknown').slice(0, 120)}`);
      }
      printProgress('Payments', done, total);
    }
  );
  process.stdout.write('\n');
  errors.forEach((line) => console.log(line));
  printSummary(results, Date.now() - startTime);
}

main().catch((error) => {
  console.error('\n❌ Error:', error.message);
  process.exit(1);
});
