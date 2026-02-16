import { createPublicClient, http, parseAbiItem, type PublicClient, type Address } from 'viem';

export interface ChainConfig {
  networkId: number;
  rpcUrl: string;
  gatewayAddress: string;
}

export interface ChainClient {
  client: PublicClient;
  gatewayAddress: Address;
}

export interface OnChainPaymentDetails {
  payerAddress: string;
  amount: string;
  transactionHash: string;
  timestamp: string;
}

const PAYMENT_GATEWAY_ABI = [
  {
    type: 'function',
    name: 'processedPayments',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;

const PAYMENT_COMPLETED_EVENT = parseAbiItem(
  'event PaymentCompleted(bytes32 indexed paymentId, bytes32 indexed merchantId, address indexed payerAddress, address recipientAddress, address tokenAddress, uint256 amount, uint256 fee, uint256 timestamp)'
);

/**
 * Create viem PublicClient for each chain loaded from DB.
 */
export function createBlockchainClients(chains: ChainConfig[]): Map<number, ChainClient> {
  const clients = new Map<number, ChainClient>();

  for (const chain of chains) {
    const client = createPublicClient({
      transport: http(chain.rpcUrl),
    });
    clients.set(chain.networkId, {
      client: client as PublicClient,
      gatewayAddress: chain.gatewayAddress as Address,
    });
  }

  return clients;
}

/**
 * Check if a payment has been processed on-chain.
 * Returns payment details if confirmed, null if still pending.
 */
export async function checkPaymentOnChain(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string
): Promise<OnChainPaymentDetails | null> {
  const isProcessed = await client.readContract({
    address: gatewayAddress,
    abi: PAYMENT_GATEWAY_ABI,
    functionName: 'processedPayments',
    args: [paymentHash as `0x${string}`],
  });

  if (!isProcessed) {
    return null;
  }

  return getPaymentDetails(client, gatewayAddress, paymentHash);
}

async function getPaymentDetails(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string
): Promise<OnChainPaymentDetails | null> {
  const currentBlock = await client.getBlockNumber();
  const fromBlock = currentBlock > BigInt(10000) ? currentBlock - BigInt(10000) : BigInt(0);

  const logs = await client.getLogs({
    address: gatewayAddress,
    event: PAYMENT_COMPLETED_EVENT,
    args: {
      paymentId: paymentHash as `0x${string}`,
    },
    fromBlock,
    toBlock: 'latest',
  });

  if (logs.length === 0) {
    return null;
  }

  const log = logs[0];
  if (!log.blockHash) {
    return null;
  }

  const block = await client.getBlock({ blockHash: log.blockHash });
  const args = log.args;

  return {
    payerAddress: args.payerAddress || '',
    amount: (args.amount || BigInt(0)).toString(),
    timestamp: new Date(Number(args.timestamp || block.timestamp) * 1000).toISOString(),
    transactionHash: log.transactionHash,
  };
}
