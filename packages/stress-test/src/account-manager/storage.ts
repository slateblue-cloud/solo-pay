/**
 * Account storage - save/load test accounts to/from JSON file
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { TestAccount } from './generator';

export interface StoredAccounts {
  network: string;
  generatedAt: string;
  count: number;
  accounts: TestAccount[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Find package root by looking for package.json
function findPackageRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      // Check if this is stress-test package
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8'));
        if (pkg.name === '@solo-pay/stress-test') {
          return dir;
        }
      } catch {}
    }
    dir = path.dirname(dir);
  }
  // Fallback: go up from src/account-manager to stress-test root
  return path.resolve(__dirname, '../..');
}

const PACKAGE_ROOT = findPackageRoot(__dirname);
const ACCOUNTS_DIR = path.join(PACKAGE_ROOT, 'data');
const ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'accounts.json');

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(ACCOUNTS_DIR)) {
    fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
  }
}

/**
 * Save accounts to JSON file
 */
export function saveAccounts(accounts: TestAccount[], network: string): void {
  ensureDataDir();

  const data: StoredAccounts = {
    network,
    generatedAt: new Date().toISOString(),
    count: accounts.length,
    accounts,
  };

  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(data, null, 2));
}

/**
 * Load accounts from JSON file
 */
export function loadAccounts(): StoredAccounts | null {
  if (!fs.existsSync(ACCOUNTS_FILE)) {
    return null;
  }

  const content = fs.readFileSync(ACCOUNTS_FILE, 'utf-8');
  return JSON.parse(content) as StoredAccounts;
}

/**
 * Check if accounts file exists
 */
export function hasAccounts(): boolean {
  return fs.existsSync(ACCOUNTS_FILE);
}

/**
 * Get accounts file path
 */
export function getAccountsFilePath(): string {
  return ACCOUNTS_FILE;
}

/**
 * Delete accounts file
 */
export function clearAccounts(): void {
  if (fs.existsSync(ACCOUNTS_FILE)) {
    fs.unlinkSync(ACCOUNTS_FILE);
  }
}
