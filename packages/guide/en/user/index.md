# User Guide

A guide on how to make payments with SoloPay.

## Before You Start

To make payments with SoloPay, you need:

- **MetaMask** or **Trust Wallet** (browser extension or mobile app)
- **ERC-20 token** balance to pay with

::: tip No Gas Fees
SoloPay covers blockchain gas fees on your behalf. You don't need POL or any other native token to pay.
:::

## Step 1: Select Your Wallet

When the payment widget opens, select the wallet you want to use.

![Select wallet](/images/user-guide/01-wallet-connect.png)

## Paying with MetaMask

### Step 2: Approve Connection

A MetaMask popup will appear. Select your account and click **Connect**.

![Approve MetaMask connection](/images/user-guide/02-metamask-connect.png)

### Step 3: Review Payment Details

Review the amount, network, and gas fee. The gas fee shows **Free (Covered by Solo Pay)**. Click **Pay Now**.

![Review payment details](/images/user-guide/03-payment-confirm.png)

### Step 4: Sign the Spending Cap Request

A **Spending cap request** popup will appear. This is a signature that allows SoloPay to process the token — it is not a transaction, so **no gas fee is charged**. Click **Confirm**.

![Sign spending cap request](/images/user-guide/04-metamask-approve.png)

### Step 5: Sign the Payment Request

A **Signature request** popup will appear. This is the final payment authorization. No gas fee is charged. Click **Confirm**.

![Sign payment request](/images/user-guide/05-sign-request.png)

### Step 6: Payment Complete

When the **Payment Complete** screen appears, your payment has been processed and the funds are held securely. Click **Confirm** to return to the merchant page. The merchant will then complete the order (release the payment) or cancel (refund you); you don't need to do anything else.

![Payment complete](/images/user-guide/06-payment-complete.png)

## Paying with Trust Wallet

### Step 2: Approve Connection

A Trust Wallet popup will appear. Confirm your account and click **Connect**.

![Approve Trust Wallet connection](/images/user-guide/02-trustwallet-connect.png)

### Step 3: Review Payment Details

Review the amount, network, and gas fee. The gas fee shows **Free (Covered by Solo Pay)**. Click **Pay Now**.

![Review payment details](/images/user-guide/03-payment-confirm.png)

### Step 4: Sign the Spending Cap Request

A **High risk message payload** banner appears at the top. This is Trust Wallet's default security notice and is part of the normal payment process. Click **Confirm**.

![Signature request screen](/images/user-guide/04-trustwallet-approve.png)

### Step 5: Sign the Payment Request

A **Signature request** popup will appear. This is the final payment authorization. No gas fee is charged. Click **Confirm**.

![Sign payment request](/images/user-guide/05-trustwallet-sign-request.png)

### Step 6: Payment Complete

When the **Payment Complete** screen appears, your payment has been processed and the funds are held securely. Click **Confirm** to return to the merchant page. The merchant will then complete the order (release the payment) or cancel (refund you); you don't need to do anything else.

![Payment complete](/images/user-guide/06-payment-complete.png)

## FAQ

1. **Why are there no gas fees?**

   SoloPay uses a gasless payment method. SoloPay covers the blockchain transaction fees, so you can pay without any additional cost.

2. **Why am I asked to sign twice?**

   For your first payment, you will be asked for a spending cap signature (Step 4) followed by a payment signature (Step 5). Both are signatures, not transactions, so no gas fee is charged for either.

3. **Trust Wallet shows "Warning! You could lose all your tokens!"**

   This is Trust Wallet's built-in security warning for Permit-type signature requests. SoloPay is a verified service — click **Continue anyway** to proceed safely.

4. **The merchant says my payment is still processing. Why?**

   As soon as you see **Payment Complete**, your payment is secured (funds are held). The merchant will finalize it after confirming your order, or cancel and refund you if needed. This usually takes a short time — no action is required from you.
