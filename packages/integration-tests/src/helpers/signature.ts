import { ethers, Wallet, Interface, solidityPackedKeccak256, ZeroHash } from 'ethers';
import { CONTRACT_ADDRESSES, TEST_CHAIN_ID, HARDHAT_ACCOUNTS } from '../setup/wallets';
import { PaymentGatewayABI, getProvider } from './blockchain';

/**
 * Default escrow duration for tests (1 day in seconds)
 */
export const DEFAULT_ESCROW_DURATION = 86400n;

/**
 * Zero permit signature for skipping permit and using traditional approve flow
 */
export const ZERO_PERMIT = {
  deadline: 0n,
  v: 0,
  r: ZeroHash,
  s: ZeroHash,
};

export interface ForwardRequest {
  from: string;
  to: string;
  value: bigint;
  gas: bigint;
  nonce: bigint;
  deadline: bigint;
  data: string;
}

export interface ForwardRequestData {
  from: string;
  to: string;
  value: bigint;
  gas: bigint;
  deadline: bigint;
  data: string;
  signature: string;
}

export interface PaymentParams {
  paymentId: string;
  tokenAddress: string;
  amount: bigint;
  recipientAddress: string;
  merchantId: string;
  deadline: bigint;
  escrowDuration: bigint;
}

const FORWARD_REQUEST_TYPES = {
  ForwardRequest: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'gas', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint48' },
    { name: 'data', type: 'bytes' },
  ],
};

const PAYMENT_REQUEST_TYPES = {
  PaymentRequest: [
    { name: 'paymentId', type: 'bytes32' },
    { name: 'tokenAddress', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'recipientAddress', type: 'address' },
    { name: 'merchantId', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' },
    { name: 'escrowDuration', type: 'uint256' },
  ],
};

export function getEIP712Domain(forwarderAddress: string, chainId: number = TEST_CHAIN_ID) {
  return {
    name: 'SoloForwarder',
    version: '1',
    chainId: chainId,
    verifyingContract: forwarderAddress,
  };
}

export function getPaymentGatewayDomain(
  gatewayAddress: string = CONTRACT_ADDRESSES.paymentGateway,
  chainId: number = TEST_CHAIN_ID
) {
  return {
    name: 'SoloPayGateway',
    version: '1',
    chainId: chainId,
    verifyingContract: gatewayAddress,
  };
}

export async function signForwardRequest(
  request: ForwardRequest,
  privateKey: string,
  forwarderAddress: string = CONTRACT_ADDRESSES.forwarder,
  chainId: number = TEST_CHAIN_ID
): Promise<string> {
  const provider = getProvider();
  const wallet = new Wallet(privateKey, provider);
  const domain = getEIP712Domain(forwarderAddress, chainId);

  const message = {
    from: request.from,
    to: request.to,
    value: request.value,
    gas: request.gas,
    nonce: request.nonce,
    deadline: request.deadline,
    data: request.data,
  };

  const signature = await wallet.signTypedData(domain, FORWARD_REQUEST_TYPES, message);
  return signature;
}

/**
 * Sign a payment request with server's private key
 * This signature is verified by the PaymentGateway contract
 */
export async function signPaymentRequest(
  params: PaymentParams,
  signerPrivateKey: string = HARDHAT_ACCOUNTS.signer.privateKey,
  gatewayAddress: string = CONTRACT_ADDRESSES.paymentGateway,
  chainId: number = TEST_CHAIN_ID
): Promise<string> {
  const provider = getProvider();
  const wallet = new Wallet(signerPrivateKey, provider);
  const domain = getPaymentGatewayDomain(gatewayAddress, chainId);

  const message = {
    paymentId: params.paymentId,
    tokenAddress: params.tokenAddress,
    amount: params.amount,
    recipientAddress: params.recipientAddress,
    merchantId: params.merchantId,
    deadline: params.deadline,
    escrowDuration: params.escrowDuration,
  };

  const signature = await wallet.signTypedData(domain, PAYMENT_REQUEST_TYPES, message);
  return signature;
}

/**
 * Convert merchant key string to bytes32 merchantId
 */
export function merchantKeyToId(merchantKey: string): string {
  return solidityPackedKeccak256(['string'], [merchantKey]);
}

export function encodePayFunctionData(
  paymentId: string,
  tokenAddress: string,
  amount: bigint,
  recipientAddress: string,
  merchantId: string,
  deadline: bigint,
  escrowDuration: bigint,
  serverSignature: string
): string {
  const iface = new Interface(PaymentGatewayABI);
  return iface.encodeFunctionData('pay', [
    paymentId,
    tokenAddress,
    amount,
    recipientAddress,
    merchantId,
    deadline,
    escrowDuration,
    serverSignature,
    ZERO_PERMIT,
  ]);
}

export function generatePaymentId(orderId: string): string {
  return ethers.id(orderId);
}

export function buildForwardRequestData(
  request: ForwardRequest,
  signature: string
): ForwardRequestData {
  return {
    from: request.from,
    to: request.to,
    value: request.value,
    gas: request.gas,
    deadline: request.deadline,
    data: request.data,
    signature,
  };
}

export function getDeadline(hoursFromNow: number = 1): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + hoursFromNow * 3600);
}

// --- Refund ---

const REFUND_REQUEST_TYPES = {
  RefundRequest: [{ name: 'paymentId', type: 'bytes32' }],
};

export async function signRefundRequest(
  paymentId: string,
  signerPrivateKey: string = HARDHAT_ACCOUNTS.signer.privateKey,
  gatewayAddress: string = CONTRACT_ADDRESSES.paymentGateway,
  chainId: number = TEST_CHAIN_ID
): Promise<string> {
  const provider = getProvider();
  const wallet = new Wallet(signerPrivateKey, provider);
  const domain = getPaymentGatewayDomain(gatewayAddress, chainId);

  return wallet.signTypedData(domain, REFUND_REQUEST_TYPES, { paymentId });
}

export function encodeRefundFunctionData(
  originalPaymentId: string,
  serverSignature: string
): string {
  const iface = new Interface(PaymentGatewayABI);
  return iface.encodeFunctionData('refund', [originalPaymentId, serverSignature, ZERO_PERMIT]);
}

// --- Finalize / Cancel ---

const FINALIZE_REQUEST_TYPES = {
  FinalizeRequest: [{ name: 'paymentId', type: 'bytes32' }],
};

const CANCEL_REQUEST_TYPES = {
  CancelRequest: [{ name: 'paymentId', type: 'bytes32' }],
};

export async function signFinalizeRequest(
  paymentId: string,
  signerPrivateKey: string = HARDHAT_ACCOUNTS.signer.privateKey,
  gatewayAddress: string = CONTRACT_ADDRESSES.paymentGateway,
  chainId: number = TEST_CHAIN_ID
): Promise<string> {
  const provider = getProvider();
  const wallet = new Wallet(signerPrivateKey, provider);
  const domain = getPaymentGatewayDomain(gatewayAddress, chainId);

  return wallet.signTypedData(domain, FINALIZE_REQUEST_TYPES, { paymentId });
}

export async function signCancelRequest(
  paymentId: string,
  signerPrivateKey: string = HARDHAT_ACCOUNTS.signer.privateKey,
  gatewayAddress: string = CONTRACT_ADDRESSES.paymentGateway,
  chainId: number = TEST_CHAIN_ID
): Promise<string> {
  const provider = getProvider();
  const wallet = new Wallet(signerPrivateKey, provider);
  const domain = getPaymentGatewayDomain(gatewayAddress, chainId);

  return wallet.signTypedData(domain, CANCEL_REQUEST_TYPES, { paymentId });
}
