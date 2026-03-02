# Testing & QA

A guide to testing and validating your payment system on testnet before going live.

## Testnet Environment Guide

SoloPay supports various testnets for development and validation. The following uses Polygon Amoy testnet as the primary reference.

### 1. Configure Test Network (MetaMask)

- **Network Name**: Polygon Amoy Testnet
- **RPC URL**: `https://rpc-amoy.polygon.technology`
- **Chain ID**: `80002`
- **Currency Symbol**: `MATIC`
- **Block Explorer**: `https://amoy.polygonscan.com/`

### 2. Get Gas Fees (Faucet) and Test Tokens

You need test MATIC for transaction gas fees and test ERC-20 tokens for actual payment.

- **Test Gas (MATIC) Faucet**: Visit [Polygon Faucet](https://faucet.polygon.technology/) and enter your wallet address to receive MATIC.
- **Test Tokens (ERC-20)**: Request the faucet URL from the operations team or ask your contact for test tokens registered with your merchant setup.

## Test Scenario Checklist

We recommend testing all three key scenarios below before launching.

### Case A: Fully Gasless (Permit-Supported Token)

This scenario covers tokens such as USDC that support EIP-2612 Permit.

1. Prepare a test account with **0 MATIC** (no gas).
2. Transfer only test tokens to that wallet.
3. Create a payment session of 10 or more units via SoloPay and request a signature.
4. **Verify results**:
   - Only a signature (Sign) popup should appear — no gas transaction.
   - After signing, payment should be processed (status becomes `ESCROWED`) via the relayer.
   - MATIC balance should remain unchanged; only the test token balance should decrease correctly.

### Case B: Infinite Approve (Non-Permit Standard Token)

This covers standard test tokens that do not support Permit. Since a one-time Approve transaction is required, the wallet needs MATIC for gas.

1. Prepare the wallet with both test MATIC (for gas) and test tokens (for payment).
2. Attempting a payment will trigger an `approve` transaction popup on the first attempt.
3. Approve with **'Max' or an amount much larger than the payment** to complete the Approve.
4. Once the approval transaction is included in a block, approve the subsequent `ForwardRequest` signature popup to complete the payment.
5. **Verify results**:
   - The first payment incurs gas fees for Approve.
   - When the same user makes a second payment with the same method, **confirm that the Approve popup is skipped and only a gasless signature is required**. (Fully gasless from the second payment onward)

### Case C: Failure Handling (Expiry and Insufficient Balance)

Validate that the system handles failure scenarios gracefully.

1. **Insufficient Balance**: Attempt a payment for an amount significantly higher than the wallet's test token balance. (Confirm rejection at the Relay step or revert at the smart contract)
2. **Payment Expiry**: Create a payment session, then wait **30 minutes** without signing (or close the window). Confirm that querying the payment status from the merchant backend returns `EXPIRED`.
3. **User Rejection**: When MetaMask requests a signature, have the user click 'Reject'. Confirm the client detects this and displays a "Signature was cancelled." message.

## Payment Result Cross-Verification Check

When a user returns to your page via `successUrl`, verify that your merchant server performs correct validation from the backend perspective.

- Ensure the `paymentId` URL parameter is not blindly trusted as proof of payment completion. (Always verify status via server-to-server communication)
- Verify that when a malicious user submits a completed `paymentId` from another merchant or a payment ID with a different amount, the backend's `amount` check causes it to be rejected.
