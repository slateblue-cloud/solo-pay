import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadAccounts } from '../account-manager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, '..', '..');
const configPath = path.join(packageRoot, 'src', 'client', 'playwright.config.ts');

const stored = loadAccounts();
if (!stored) {
  console.error('No stored accounts found. Run "pnpm accounts:generate" first.');
  process.exit(1);
}

// Check for count argument (e.g. "execute:client 5")
const args = process.argv.slice(2);
const countArg = args.find((arg) => /^\d+$/.test(arg));
const requestedLimit = countArg ? parseInt(countArg, 10) : undefined;

const maxAccounts = stored.accounts.length;
const repeat = requestedLimit ? Math.min(requestedLimit, maxAccounts) : maxAccounts;

const workersEnv = process.env.WORKERS ? parseInt(process.env.WORKERS, 10) : NaN;
const workers = workersEnv >= 1 ? workersEnv : Math.min(repeat, 3);

// Remove the count argument from playwright args if it exists
const playwrightArgs = args.filter((arg) => arg !== countArg).filter(Boolean);
const playwrightBin = path.join(packageRoot, 'node_modules', '.bin', 'playwright');
const cmd = [playwrightBin, 'test', '-c', configPath, ...playwrightArgs].join(' ');

const env = { ...process.env, REPEAT: String(repeat), WORKERS: String(workers) };
console.log(`Running ${repeat} iterations (from accounts.json), ${workers} workers`);
execSync(cmd, { stdio: 'inherit', cwd: packageRoot, env });
