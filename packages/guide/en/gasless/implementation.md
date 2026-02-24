# Gasless Implementation

A detailed guide to implementing Gasless payments.

::: tip Use the Widget (Recommended)
The easiest way to use Gasless payments is via the `@solo-pay/widget-js` or `@solo-pay/widget-react` SDK. The widget automatically handles token Approve checks, Permit (EIP-2612) detection, EIP-712 signing, and relay submission.

See [Widget Integration Guide](/en/widget/) for quick setup.
:::

## Custom Implementation Flow

If you need a custom flow instead of the widget, follow the steps below. All steps are client-side and use the REST API directly.

```
1. Create Payment (REST API — client-side)
       ↓
2. Token Approve check (frontend)
       ↓
3. Request EIP-712 Signature (frontend)
       ↓
4. Submit Gasless Request (REST API — client-side)
       ↓
5. Check Status (REST API — client-side)
```

## Step 1: Create Payment

Call `POST /payments` with the `x-public-key` header. This can be called directly from the browser.

```typescript
const response = await fetch('https://pay-api.staging.msq.com/api/v1/payments', {
  method: 'POST',
  headers: {
    'x-public-key': 'pk_test_xxxxx',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    orderId: 'order-001',
    amount: 10.5,
    tokenAddress: '0xE4C687167705Abf55d709395f92e254bdF5825a2',
    successUrl: 'https://example.com/success',
    failUrl: 'https://example.com/fail',
  }),
});

const payment = await response.json();
// payment contains: paymentId, forwarderAddress, gatewayAddress, amount, serverSignature, ...
```

::: warning Check forwarderAddress
`payment.forwarderAddress` must be present to use Gasless on that chain.
:::

## Step 2: Token Approve

Even for Gasless payments, the Relayer cannot transfer tokens unless the user has first **completed an `approve` transaction granting the PaymentGateway contract permission** to use the token.

```typescript
import { useWriteContract, useReadContract } from 'wagmi';

// 1. Check existing allowance
const { data: allowance } = useReadContract({
  address: tokenAddress,
  abi: ERC20ABI,
  functionName: 'allowance',
  args: [userAddress, gatewayAddress],
});

// 2. If insufficient, send Approve transaction (user pays gas for this 1-time setup)
if (allowance < BigInt(amount)) {
  await writeContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'approve',
    args: [gatewayAddress, amount],
  });
}
```

::: info Permit (Signature Approval) Supported Tokens
Modern tokens like USDC support `Permit` (EIP-2612), which replaces the `approve` transaction with a simple signature.
**If you use the official SoloPay Widget (`@solo-pay/widget-js` or `@solo-pay/widget-react`), it will automatically detect EIP-2612 support and skip the 1-time `approve` transaction, handling the `Permit` entirely gas-free via signature.**
:::

::: tip
Once a sufficient amount is approved, all subsequent purchases (Step 3) can be completely gasless via **Signature only**.
:::

## Step 3: Request EIP-712 Signature

Request a signature from the user on the frontend.

```typescript
import { useSignTypedData } from 'wagmi';
import { encodeFunctionData } from 'viem';

const { signTypedDataAsync } = useSignTypedData();

// Fetch current nonce from Forwarder
const nonce = await publicClient.readContract({
  address: forwarderAddress,
  abi: ERC2771ForwarderABI,
  functionName: 'nonces',
  args: [userAddress],
});

// Build Forward Request
const forwardRequest = {
  from: userAddress,
  to: gatewayAddress,
  value: 0n,
  gas: 200000n,
  nonce,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour
  data: encodeFunctionData({
    abi: PaymentGatewayABI,
    functionName: 'payWithSignature',
    args: [
      paymentId,
      tokenAddress,
      BigInt(amount),
      recipientAddress,
      merchantId,
      feeBps,
      serverSignature,
    ],
  }),
};

// EIP-712 Sign
const signature = await signTypedDataAsync({
  domain: {
    name: 'ERC2771Forwarder', // OpenZeppelin ERC2771Forwarder default
    version: '1',
    chainId: 80002, // Polygon Amoy
    verifyingContract: forwarderAddress,
  },
  types: {
    ForwardRequest: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'gas', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint48' },
      { name: 'data', type: 'bytes' },
    ],
  },
  primaryType: 'ForwardRequest',
  message: forwardRequest,
});
```

::: warning Important
Signing is NOT a transaction, so **no gas fees are charged**.
The `payWithSignature` function requires `serverSignature` as an argument.
:::

## Step 4: Submit Gasless Request

**Endpoint**: `POST /payments/:id/relay`

```typescript
const result = await fetch(
  `https://pay-api.staging.msq.com/api/v1/payments/${payment.paymentId}/relay`,
  {
    method: 'POST',
    headers: {
      'x-public-key': 'pk_test_xxxxx',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      paymentId: payment.paymentId,
      forwarderAddress: payment.forwarderAddress,
      forwardRequest: {
        from: forwardRequest.from,
        to: forwardRequest.to,
        value: '0',
        gas: '200000',
        nonce: forwardRequest.nonce.toString(),
        deadline: forwardRequest.deadline.toString(),
        data: forwardRequest.data,
        signature,
      },
    }),
  }
).then((r) => r.json());
```

## Step 5: Check Status

```typescript
// Relay status (by paymentId)
const relayStatus = await fetch(
  `https://pay-api.staging.msq.com/api/v1/payments/${paymentId}/relay`,
  { headers: { 'x-public-key': 'pk_test_xxxxx' } }
).then((r) => r.json());
// relayStatus.data.status: 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'

// Payment status
const paymentStatus = await fetch(`https://pay-api.staging.msq.com/api/v1/payments/${paymentId}`, {
  headers: { 'x-public-key': 'pk_test_xxxxx' },
}).then((r) => r.json());
// paymentStatus.data.status: 'CREATED' | 'PENDING' | 'CONFIRMED' | 'FAILED'
```

## Full Example (React + wagmi)

```typescript
function GaslessPayment({ payment }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  const { paymentId, forwarderAddress, gatewayAddress, amount, tokenAddress,
          recipientAddress, merchantId, feeBps, serverSignature, chainId } = payment;

  const handleGaslessPayment = async () => {
    const nonce = await publicClient.readContract({
      address: forwarderAddress, abi: ERC2771ForwarderABI,
      functionName: 'nonces', args: [address],
    });

    const forwardRequest = {
      from: address, to: gatewayAddress, value: 0n, gas: 200000n, nonce,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      data: encodeFunctionData({
        abi: PaymentGatewayABI, functionName: 'payWithSignature',
        args: [paymentId, tokenAddress, BigInt(amount), recipientAddress, merchantId, feeBps, serverSignature],
      }),
    };

    const signature = await signTypedDataAsync({
      domain: { name: 'ERC2771Forwarder', version: '1', chainId, verifyingContract: forwarderAddress },
      types: {
        ForwardRequest: [
          { name: 'from', type: 'address' }, { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' }, { name: 'gas', type: 'uint256' },
          { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint48' },
          { name: 'data', type: 'bytes' },
        ],
      },
      primaryType: 'ForwardRequest', message: forwardRequest,
    });

    const result = await fetch(
      `https://pay-api.staging.msq.com/api/v1/payments/${paymentId}/relay`,
      {
        method: 'POST',
        headers: { 'x-public-key': 'pk_test_xxxxx', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId, forwarderAddress,
          forwardRequest: {
            from: forwardRequest.from, to: forwardRequest.to,
            value: '0', gas: '200000',
            nonce: forwardRequest.nonce.toString(),
            deadline: forwardRequest.deadline.toString(),
            data: forwardRequest.data, signature,
          },
        }),
      }
    ).then((r) => r.json());

    return result;
  };

  return <button onClick={handleGaslessPayment}>Pay without gas</button>;
}
```

## Error Handling

| Error Code               | Cause                          | Resolution                                          |
| ------------------------ | ------------------------------ | --------------------------------------------------- |
| `INVALID_SIGNATURE`      | Invalid signature format       | Ensure signature is a hex string starting with `0x` |
| `INVALID_PAYMENT_STATUS` | Payment not in CREATED/PENDING | Prevent duplicate requests on completed payments    |
| `PAYMENT_EXPIRED`        | Payment expired                | Create a new payment and retry                      |
| `RELAYER_NOT_CONFIGURED` | No Relayer for this chain      | Verify supported chains                             |
| `VALIDATION_ERROR`       | Input validation failed        | Verify forwardRequest amount matches payment amount |

## Next Steps

- [Webhooks](/en/webhooks/) - Receive payment completion notifications
- [Error Codes](/en/api/errors) - Full error list
