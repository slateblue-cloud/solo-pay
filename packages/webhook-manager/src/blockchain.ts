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
  transactionHash: string;
  amount: string;
  timestamp: string;
  /** Only available from PaymentEscrowed event */
  payerAddress?: string;
  /** Only available from PaymentEscrowed event */
  escrowDeadline?: string;
  /** Only available from PaymentFinalized event */
  fee?: string;
}

/** Mirrors the Solidity PaymentStatus enum in PaymentGatewayV1.sol */
export const OnChainPaymentStatus = {
  None: 0,
  Escrowed: 1,
  Finalized: 2,
  Cancelled: 3,
  Refunded: 4,
} as const;

export type OnChainPaymentStatusValue =
  (typeof OnChainPaymentStatus)[keyof typeof OnChainPaymentStatus];

const PAYMENT_STATUS_ABI = [
  {
    type: 'function',
    name: 'paymentStatus',
    inputs: [{ name: 'paymentId', type: 'bytes32' }],
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
  },
] as const;

const PAYMENT_ESCROWED_EVENT = parseAbiItem(
  'event PaymentEscrowed(bytes32 indexed paymentId, bytes32 indexed merchantId, address indexed payerAddress, address recipientAddress, address tokenAddress, uint256 amount, uint256 escrowDeadline, uint256 timestamp)'
);

const PAYMENT_FINALIZED_EVENT = parseAbiItem(
  'event PaymentFinalized(bytes32 indexed paymentId, bytes32 indexed merchantId, address recipientAddress, address tokenAddress, uint256 amount, uint256 fee, uint256 timestamp)'
);

const PAYMENT_CANCELLED_EVENT = parseAbiItem(
  'event PaymentCancelled(bytes32 indexed paymentId, bytes32 indexed merchantId, address indexed payerAddress, address tokenAddress, uint256 amount, uint256 timestamp)'
);

const REFUND_COMPLETED_EVENT = parseAbiItem(
  'event RefundCompleted(bytes32 indexed originalPaymentId, bytes32 indexed merchantId, address indexed payerAddress, address merchantAddress, address tokenAddress, uint256 amount, uint256 timestamp)'
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
 * Get the on-chain payment status (uint8 enum) and event details.
 * Queries the appropriate event based on the on-chain status:
 *   Escrowed  → PaymentEscrowed
 *   Finalized → PaymentFinalized (fallback: PaymentEscrowed)
 *   Cancelled → PaymentCancelled (fallback: PaymentEscrowed)
 *   Refunded  → RefundCompleted  (fallback: PaymentEscrowed)
 *
 * Returns { status, details } where details is null for None status.
 */
export async function getOnChainStatus(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string
): Promise<{ status: OnChainPaymentStatusValue; details: OnChainPaymentDetails | null }> {
  const statusValue = await client.readContract({
    address: gatewayAddress,
    abi: PAYMENT_STATUS_ABI,
    functionName: 'paymentStatus',
    args: [paymentHash as `0x${string}`],
  });

  const status = Number(statusValue) as OnChainPaymentStatusValue;

  if (status === OnChainPaymentStatus.None) {
    return { status, details: null };
  }

  const fromBlock = await resolveFromBlock(client);

  let details: OnChainPaymentDetails | null = null;

  switch (status) {
    case OnChainPaymentStatus.Escrowed:
      details = await queryEscrowedEvent(client, gatewayAddress, paymentHash, fromBlock);
      break;

    case OnChainPaymentStatus.Finalized:
      details = await queryFinalizedEvent(client, gatewayAddress, paymentHash, fromBlock);
      if (!details)
        details = await queryEscrowedEvent(client, gatewayAddress, paymentHash, fromBlock);
      break;

    case OnChainPaymentStatus.Cancelled:
      details = await queryCancelledEvent(client, gatewayAddress, paymentHash, fromBlock);
      if (!details)
        details = await queryEscrowedEvent(client, gatewayAddress, paymentHash, fromBlock);
      break;

    case OnChainPaymentStatus.Refunded:
      details = await queryRefundedEvent(client, gatewayAddress, paymentHash, fromBlock);
      if (!details)
        details = await queryEscrowedEvent(client, gatewayAddress, paymentHash, fromBlock);
      break;
  }

  return { status, details };
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function resolveFromBlock(client: PublicClient): Promise<bigint> {
  const currentBlock = await client.getBlockNumber();
  return currentBlock > BigInt(10000) ? currentBlock - BigInt(10000) : BigInt(0);
}

async function queryEscrowedEvent(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string,
  fromBlock: bigint
): Promise<OnChainPaymentDetails | null> {
  const logs = await client.getLogs({
    address: gatewayAddress,
    event: PAYMENT_ESCROWED_EVENT,
    args: { paymentId: paymentHash as `0x${string}` },
    fromBlock,
    toBlock: 'latest',
  });

  if (logs.length === 0 || !logs[0].blockHash) return null;

  const log = logs[0];
  const block = await client.getBlock({ blockHash: log.blockHash });
  const args = log.args;

  return {
    transactionHash: log.transactionHash,
    amount: (args.amount || BigInt(0)).toString(),
    timestamp: new Date(Number(args.timestamp || block.timestamp) * 1000).toISOString(),
    payerAddress: args.payerAddress || '',
    escrowDeadline: new Date(Number(args.escrowDeadline || 0) * 1000).toISOString(),
  };
}

async function queryFinalizedEvent(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string,
  fromBlock: bigint
): Promise<OnChainPaymentDetails | null> {
  const logs = await client.getLogs({
    address: gatewayAddress,
    event: PAYMENT_FINALIZED_EVENT,
    args: { paymentId: paymentHash as `0x${string}` },
    fromBlock,
    toBlock: 'latest',
  });

  if (logs.length === 0 || !logs[0].blockHash) return null;

  const log = logs[0];
  const block = await client.getBlock({ blockHash: log.blockHash });
  const args = log.args;

  return {
    transactionHash: log.transactionHash,
    amount: (args.amount || BigInt(0)).toString(),
    timestamp: new Date(Number(args.timestamp || block.timestamp) * 1000).toISOString(),
    fee: (args.fee || BigInt(0)).toString(),
  };
}

async function queryCancelledEvent(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string,
  fromBlock: bigint
): Promise<OnChainPaymentDetails | null> {
  const logs = await client.getLogs({
    address: gatewayAddress,
    event: PAYMENT_CANCELLED_EVENT,
    args: { paymentId: paymentHash as `0x${string}` },
    fromBlock,
    toBlock: 'latest',
  });

  if (logs.length === 0 || !logs[0].blockHash) return null;

  const log = logs[0];
  const block = await client.getBlock({ blockHash: log.blockHash });
  const args = log.args;

  return {
    transactionHash: log.transactionHash,
    amount: (args.amount || BigInt(0)).toString(),
    timestamp: new Date(Number(args.timestamp || block.timestamp) * 1000).toISOString(),
    payerAddress: args.payerAddress || '',
  };
}

async function queryRefundedEvent(
  client: PublicClient,
  gatewayAddress: Address,
  paymentHash: string,
  fromBlock: bigint
): Promise<OnChainPaymentDetails | null> {
  const logs = await client.getLogs({
    address: gatewayAddress,
    event: REFUND_COMPLETED_EVENT,
    args: { originalPaymentId: paymentHash as `0x${string}` },
    fromBlock,
    toBlock: 'latest',
  });

  if (logs.length === 0 || !logs[0].blockHash) return null;

  const log = logs[0];
  const block = await client.getBlock({ blockHash: log.blockHash });
  const args = log.args;

  return {
    transactionHash: log.transactionHash,
    amount: (args.amount || BigInt(0)).toString(),
    timestamp: new Date(Number(args.timestamp || block.timestamp) * 1000).toISOString(),
    payerAddress: args.payerAddress || '',
  };
}
