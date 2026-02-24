# Smart Contract Information

Addresses and core interfaces for the smart contracts that make up the SoloPay payment system.

## Contract Addresses by Network

::: warning Testnet Addresses
These are currently testnet addresses. Mainnet addresses will be announced separately.
:::

### Polygon Amoy (80002)

| Contract             | Address                                            |
| -------------------- | -------------------------------------------------- |
| **PaymentGateway**   | See `gatewayAddress` in `GET /payments` response   |
| **ERC2771Forwarder** | See `forwarderAddress` in `GET /payments` response |

::: tip Why not hardcode addresses?
Contract addresses may differ per chain and per merchant, and may change on upgrades. The **payment creation API response** always contains the latest addresses — trust those values.

```json
{
  "gatewayAddress": "0x...", // PaymentGateway address
  "forwarderAddress": "0x..." // ERC2771Forwarder address (null if Gasless not supported)
}
```

:::

## Core Contract Interfaces (ABI)

### PaymentGateway

The core payment contract. It provides two payment functions.

#### `pay()` — Direct Payment (User submits TX directly)

```solidity
function pay(
    bytes32 paymentId,       // Unique payment ID (issued by API)
    address tokenAddress,    // ERC-20 token address for payment
    uint256 amount,          // Payment amount (in wei)
    address recipient,       // Recipient address (merchant wallet)
    bytes32 merchantId,      // Merchant ID
    uint256 feeBps,          // Fee (basis points, 100 = 1%)
    bytes calldata serverSignature  // Server EIP-712 signature (tamper prevention)
) external
```

**Frontend call example (wagmi)**

```typescript
import { useWriteContract } from 'wagmi';

const { writeContract } = useWriteContract();

await writeContract({
  address: gatewayAddress,
  abi: PaymentGatewayABI,
  functionName: 'pay',
  args: [
    paymentId,
    tokenAddress,
    BigInt(amount),
    recipientAddress,
    merchantId,
    BigInt(feeBps),
    serverSignature,
  ],
});
```

#### `payWithSignature()` — Gasless Payment (Relayer submits TX)

```solidity
function payWithSignature(
    bytes32 paymentId,
    address tokenAddress,
    uint256 amount,
    address recipient,
    bytes32 merchantId,
    uint256 feeBps,
    bytes calldata serverSignature  // Server EIP-712 signature
) external
```

This function is not called directly. The relayer calls it via `ERC2771Forwarder`. Merchants submit payments by calling the `POST /payments/:id/relay` API.

### ERC2771Forwarder

OpenZeppelin's standard `ERC2771Forwarder` contract. It validates user signatures in gasless payments and forwards them to `PaymentGateway`.

#### `nonces()` — Query user's current nonce

Always use the latest nonce when generating an EIP-712 signature.

```typescript
// Query current nonce
const nonce = await publicClient.readContract({
  address: forwarderAddress, // forwarderAddress from API response
  abi: ERC2771ForwarderABI,
  functionName: 'nonces',
  args: [userAddress],
});
```

## ForwardRequest Type Structure

The data structure used when generating an EIP-712 signature.

```typescript
const ForwardRequestTypes = {
  ForwardRequest: [
    { name: 'from', type: 'address' }, // User wallet address
    { name: 'to', type: 'address' }, // PaymentGateway address
    { name: 'value', type: 'uint256' }, // Always 0 (token payment)
    { name: 'gas', type: 'uint256' }, // Recommended: 200000
    { name: 'nonce', type: 'uint256' }, // Fetched from Forwarder
    { name: 'deadline', type: 'uint48' }, // Signature expiry (Unix timestamp)
    { name: 'data', type: 'bytes' }, // Encoded payWithSignature data
  ],
};

const domain = {
  name: 'ERC2771Forwarder', // Fixed value
  version: '1', // Fixed value
  chainId: 80002, // Chain ID in use
  verifyingContract: forwarderAddress,
};
```

## The Role of serverSignature

The `serverSignature` included in the payment creation response is an EIP-712 signature proving that SoloPay's server has authenticated the payment.

- **Tamper Prevention**: Merchants and users cannot arbitrarily modify `paymentId`, `amount`, `recipient`, etc.
- **Contract Verification**: `PaymentGateway` verifies on-chain that this signature belongs to SoloPay's server at the time of transaction execution.

::: warning Note
`serverSignature` is issued only once per payment creation. Previous signatures become invalid when a payment expires or a new payment is created.
:::

## Next Steps

- [Client-Side Integration](/en/developer/client-side) — Step-by-step implementation guide
- [How Payments Work](/en/developer/how-it-works) — Gasless architecture explained
