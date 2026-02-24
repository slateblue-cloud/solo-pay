# Merchant Onboarding Flow

Before integrating your first payment via SoloPay, we'll guide you through the essential merchant data setup (onboarding).

## Fetch from System Administrator

First, request the following info from your system administrator:

1. `merchantId` (merchant unique identifier)
2. `API Key` (`sk_` prefix, for merchant management API access)
3. `Public Key` (`pk_` prefix, for client access like payment creation)

## Overall Flow

To create payments, you must enable your merchant account and map the **ERC-20 payment tokens** your store accepts. Follow these steps:

### 1. Verify Merchant Setup

Use your admin API Key to ensure your merchant info is created correctly.
(e.g., `treasuryAddress` for receiving funds, etc.)

```bash
curl https://pay-api.staging.msq.com/api/v1/merchant \
  -H "x-api-key: sk_test_xxxxx"
```

### 2. Add Payment Methods

Map the contract addresses of the ERC-20 tokens your users will pay with. (Tokens must be whitelisted across the whole system to be registered).

```bash
# Add Payment Method
curl -X POST https://pay-api.staging.msq.com/api/v1/merchant/payment-methods \
  -H "x-api-key: sk_test_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "is_enabled": true
  }'
```

### 3. Check Enabled Status

Ensure the `is_enabled` status for the token is `true`. If this is `false` or the token isn't added, you'll get a `TOKEN_NOT_ENABLED` error during the `POST /payments` stage.

### 4. Integration and Testing

Once the token setup is complete, you can begin developing your payment system by referencing the [Create Payment](/en/payments/create) guide.
