# FAQ & Troubleshooting

A guide to common issues and solutions you may encounter during integration.

## Frequently Asked Questions (FAQ)

### Q. What if the user has no gas (ETH/MATIC) at all for the first Approve?

For standard ERC-20 tokens, `approve()` necessarily incurs a transaction gas fee.
**Solutions and recommendations**:

1. **Use a Permit-supported token (strongly recommended)**: By using ERC-20 tokens that natively support EIP-2612 Permit (such as USDC), even the initial Approve can be replaced with a `Permit` signature, enabling 100% signature-based gasless operation.
2. **Operate a merchant faucet**: You can airdrop a small amount of MATIC to new users via a separate merchant service, though this involves development and operational costs.

### Q. I did not receive the payment completion event via Webhook.

This may be caused by a temporary network issue. The system relayer performs **retries** at set intervals when Webhook delivery fails (i.e., no 200 OK received).
As a safety net, we recommend implementing a 'Refresh Payment Status' button on the merchant client (or server) that polls the `GET /payments/:id` API.

## Troubleshooting

### 1. Signature Verification Failed (INVALID_SIGNATURE Error)

This occurs when `INVALID_SIGNATURE` is returned when submitting a signature to the Relay API.
**Checkpoints**:

- Verify that the `chainId` in the EIP-712 domain parameters matches the chain ID of the network the user's MetaMask is currently connected to.
- Check that the `forwarderAddress` value used matches the value received in the payment session API response.
- If any value in the signed `data` structure — such as the payment amount, `paymentId`, or `serverSignature` — is changed, the signature becomes invalid.

### 2. Revert After Relay Submission (Payment Status FAILED)

This occurs when the relayer submits a transaction to the mempool but the smart contract reverts.
**Checkpoints**:

- **Insufficient Approve**: Occurs when a gasless signature is submitted without sufficient allowance for a token that does not support Permit.
- **Insufficient Balance**: The token balance in the wallet is less than the payment amount.
- **Nonce Issue**: If a user generates and submits multiple signatures in very rapid succession and a previous signature's `nonce` is resubmitted, the relay will reject it.

### 3. Client Error Messages

#### Situation A: "Unrecognized chain ID" or "Unsupported network"

The user is attempting to sign while their wallet is connected to a different network (e.g., Ethereum mainnet) instead of Polygon Amoy.

- **Solution**: Use wagmi's `useSwitchChain()` to switch the network to the contract's target chain before generating the signature.

#### Situation B: "CORS error"

This appears when the client browser calls the `POST /payments` endpoint using a Public Key (`pk_xxx`).

- **Solution**: The `Origin` header domain is not correctly registered in the admin whitelist. Request the SoloPay operations team to add the domain as an allowed origin.

## Other API Error Codes

The many status codes returned during payment session creation and relay requests each have a clear cause.
For more details, refer to the [API Error Code Reference](/en/api/errors).
