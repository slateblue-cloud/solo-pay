import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { getNetworkConfig } from '../../config';
import {
  setupAccountsForRun,
  DEFAULT_ACCOUNT_COUNT,
  DEFAULT_FUND_AMOUNT_VALUE,
} from '../ensure-accounts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.join(__dirname, '..', '..');
const configPath = path.join(packageRoot, 'src', 'client', 'playwright.config.ts');

function parseArgs(): { count: number; network: string; fundAmount: string } {
  const args = process.argv.slice(2);
  let count = DEFAULT_ACCOUNT_COUNT;
  let network = process.env.NETWORK || 'hardhat';
  let fundAmount = DEFAULT_FUND_AMOUNT_VALUE;

  const countArg = args.find((arg) => /^\d+$/.test(arg));
  if (countArg) count = parseInt(countArg, 10);

  for (const arg of args) {
    if (arg.startsWith('--network=')) network = arg.split('=')[1];
    if (arg.startsWith('--fund-amount=')) fundAmount = arg.split('=')[1];
  }

  return { count, network, fundAmount };
}

async function main() {
  const { count, network, fundAmount } = parseArgs();

  await setupAccountsForRun(count, network, fundAmount, { persist: true });

  const repeat = count;
  const workersEnv = process.env.WORKERS ? parseInt(process.env.WORKERS, 10) : NaN;
  const workers = workersEnv >= 1 ? workersEnv : Math.min(repeat, 3);

  const args = process.argv.slice(2);
  const playwrightArgs = args
    .filter(
      (arg) =>
        !/^\d+$/.test(arg) && !arg.startsWith('--network=') && !arg.startsWith('--fund-amount=')
    )
    .filter(Boolean);
  const playwrightBin = path.join(packageRoot, 'node_modules', '.bin', 'playwright');
  const cmd = [playwrightBin, 'test', '-c', configPath, ...playwrightArgs].join(' ');

  const networkConfig = getNetworkConfig(network);
  const env = {
    ...process.env,
    REPEAT: String(repeat),
    WORKERS: String(workers),
    NETWORK: network,
    MERCHANT_URL: networkConfig.merchantUrl,
    RPC_URL: networkConfig.rpcUrl,
    CHAIN_ID: String(networkConfig.chainId),
  };
  console.log(
    `Running ${repeat} iterations, ${workers} workers (merchant: ${networkConfig.merchantUrl})`
  );
  execSync(cmd, { stdio: 'inherit', cwd: packageRoot, env });
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
