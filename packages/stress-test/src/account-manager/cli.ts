#!/usr/bin/env node
/**
 * Account Manager CLI
 *
 * Commands:
 *   generate - Generate test accounts
 *   fund     - Fund test accounts with tokens
 *   list     - List current test accounts
 *   clear    - Clear saved accounts
 */

import { generateAccounts } from './generator';
import { fundAccounts, checkBalances } from './funder';
import { saveAccounts, loadAccounts, clearAccounts, getAccountsFilePath } from './storage';
import { getNetworkConfig, getAvailableNetworks } from '../../config';
import { formatUnits } from 'ethers';

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      result[key] = value ?? true;
    }
  }
  return result;
}

function printHelp(): void {
  console.log(`
Account Manager CLI

Usage:
  pnpm accounts <command> [options]

Commands:
  generate    Generate test accounts and save to accounts.json
  fund        Fund test accounts with tokens
  list        List current test accounts and balances
  clear       Clear saved accounts

Options for 'generate':
  --count=N       Number of accounts to generate (default: 10)
  --network=NAME  Network name: ${getAvailableNetworks().join(', ')} (default: hardhat)
  --random        Use random wallets instead of deterministic

Options for 'fund':
  --network=NAME  Network name (default: hardhat)
  --amount=N      Amount of tokens per account (default: 1000)

Examples:
  pnpm accounts generate --count=50 --network=hardhat
  pnpm accounts fund --network=hardhat --amount=1000
  pnpm accounts list --network=hardhat
  pnpm accounts clear
`);
}

function printProgress(current: number, total: number, label: string): void {
  const percent = Math.floor((current / total) * 100);
  const filled = Math.floor(percent / 5);
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
  process.stdout.write(`\r${label}: [${bar}] ${percent}% (${current}/${total})`);
}

async function commandGenerate(options: Record<string, string | boolean>): Promise<void> {
  const count = Number(options.count) || 10;
  const network = String(options.network || 'hardhat');
  const random = Boolean(options.random);

  console.log(
    `\n📝 Generating ${count} ${random ? 'random' : 'deterministic'} accounts for ${network}...\n`
  );

  const accounts = generateAccounts(count, { random });
  saveAccounts(accounts, network);

  console.log(`✅ Generated ${accounts.length} accounts`);
  console.log(`   First: ${accounts[0].address}`);
  console.log(`   Last:  ${accounts[accounts.length - 1].address}`);
  console.log(`   Saved to: ${getAccountsFilePath()}\n`);
}

async function commandFund(options: Record<string, string | boolean>): Promise<void> {
  const network = String(options.network || 'hardhat');
  const amount = String(options.amount || '1000');

  const stored = loadAccounts();
  if (!stored) {
    console.error('❌ No accounts found. Run "pnpm accounts generate" first.');
    process.exit(1);
  }

  if (stored.network !== network) {
    console.error(`❌ Accounts were generated for ${stored.network}, not ${network}`);
    console.error(`   Run "pnpm accounts generate --network=${network}" first.`);
    process.exit(1);
  }

  const config = getNetworkConfig(network);

  console.log(
    `\n💰 Funding ${stored.accounts.length} accounts with ${amount} ${config.tokenSymbol} each...\n`
  );

  const results = await fundAccounts(stored.accounts, config, amount, (progress) => {
    printProgress(progress.current, progress.total, 'Funding');
  });

  const successful = results.filter((r) => r.success).length;
  console.log(`\n\n✅ Funded ${successful}/${results.length} accounts\n`);

  if (successful < results.length) {
    const failed = results.filter((r) => !r.success);
    console.log('❌ Failed accounts:');
    failed.slice(0, 5).forEach((f) => {
      console.log(`   ${f.address}: ${f.error}`);
    });
    if (failed.length > 5) {
      console.log(`   ... and ${failed.length - 5} more`);
    }
  }
}

async function commandList(options: Record<string, string | boolean>): Promise<void> {
  const network = String(options.network || 'hardhat');

  const stored = loadAccounts();
  if (!stored) {
    console.log('\n📋 No accounts found. Run "pnpm accounts generate" first.\n');
    return;
  }

  console.log(`\n📋 Test Accounts (${stored.network})`);
  console.log(`   Generated: ${stored.generatedAt}`);
  console.log(`   Count: ${stored.count}`);
  console.log(`   File: ${getAccountsFilePath()}\n`);

  if (stored.network === network) {
    try {
      const config = getNetworkConfig(network);
      console.log(`   Checking balances on ${network}...\n`);

      const balances = await checkBalances(stored.accounts, config);

      console.log('   Address                                    | Balance');
      console.log('   ' + '-'.repeat(60));

      stored.accounts.slice(0, 10).forEach((account) => {
        const balance = balances.get(account.address) || 0n;
        const formatted = formatUnits(balance, config.tokenDecimals);
        console.log(`   ${account.address} | ${formatted} ${config.tokenSymbol}`);
      });

      if (stored.accounts.length > 10) {
        console.log(`   ... and ${stored.accounts.length - 10} more accounts`);
      }
    } catch (error) {
      console.log(
        `   ⚠️  Could not check balances: ${error instanceof Error ? error.message : error}`
      );
      console.log('\n   Accounts (first 10):');
      stored.accounts.slice(0, 10).forEach((account, i) => {
        console.log(`   ${i + 1}. ${account.address}`);
      });
    }
  } else {
    console.log('   Accounts (first 10):');
    stored.accounts.slice(0, 10).forEach((account, i) => {
      console.log(`   ${i + 1}. ${account.address}`);
    });
  }

  console.log('');
}

function commandClear(): void {
  clearAccounts();
  console.log('\n✅ Accounts cleared.\n');
}

async function main(): Promise<void> {
  const options = parseArgs(args);

  switch (command) {
    case 'generate':
      await commandGenerate(options);
      break;
    case 'fund':
      await commandFund(options);
      break;
    case 'list':
      await commandList(options);
      break;
    case 'clear':
      commandClear();
      break;
    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;
    default:
      if (command) {
        console.error(`Unknown command: ${command}`);
      }
      printHelp();
      process.exit(command ? 1 : 0);
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
