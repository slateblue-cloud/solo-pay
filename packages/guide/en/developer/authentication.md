# Authentication

SoloPay API uses two authentication methods depending on the endpoint type.

## Authentication Overview

| Method     | Header         | Endpoints                                                   |
| ---------- | -------------- | ----------------------------------------------------------- |
| Public Key | `x-public-key` | POST /payments, GET /payments/:id, POST /payments/:id/relay |
| API Key    | `x-api-key`    | GET /merchant/\*, POST /refunds, GET /refunds               |
| None       | -              | GET /chains, GET /chains/tokens                             |

## Getting Your Keys

Request both keys from your administrator.

| Type       | Prefix                  | Purpose                             |
| ---------- | ----------------------- | ----------------------------------- |
| API Key    | `sk_...`                | Merchant management, refunds        |
| Public Key | `pk_live_` / `pk_test_` | Payment creation and status queries |

::: warning Security Notice

- **API Key**: Server-side only. Never expose to the client.
- **Public Key**: Can be used in the browser, but we recommend configuring domain restrictions via the `Origin` header.
  :::

## API Key Usage Example

The API Key is used for server-side management operations such as merchant info queries, webhook verification, and payment history.

```bash
curl https://pay-api.staging.sut.com/api/v1/merchant \
  -H "x-api-key: sk_xxxxx"
```

## Environment Variables

```bash
SOLO_PAY_API_KEY=sk_xxxxx
SOLO_PAY_PUBLIC_KEY=pk_test_xxxxx
```

## Origin Verification

When `ALLOWED_WIDGET_ORIGIN` is set on the server, the `Origin` header will be validated. In browser environments, `Origin` is set automatically.

```bash
# Server environment variable example
ALLOWED_WIDGET_ORIGIN=https://yourshop.com
```

## Security Best Practices

**Do**

- Store keys in environment variables
- Use API Key (`sk_...`) server-side only
- Configure Origin domain restrictions when possible

**Don't**

- Expose API Key in client code
- Commit keys to version control
- Print keys in logs

::: danger Prohibited
Never include your API Key (`sk_...`) in frontend code. Only Public Keys (`pk_...`) should be used on the client side.
:::

## Next Steps

- [Create Payment](/en/payments/create) - Your first payment
