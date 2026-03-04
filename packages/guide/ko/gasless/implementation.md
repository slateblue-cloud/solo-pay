# 가스리스 구현

가스리스 결제를 구현하는 상세 가이드입니다.

::: tip 위젯 사용 권장
가스리스 결제를 사용하는 가장 쉬운 방법은 `@solo-pay/widget-js` 또는 `@solo-pay/widget-react` SDK입니다. 위젯은 토큰 Approve 확인, Permit(EIP-2612) 감지, EIP-712 서명, 릴레이 제출을 자동으로 처리합니다.

빠른 설정은 [위젯 연동 가이드](/ko/widget/)를 참조하세요.
:::

## 커스텀 구현 흐름

위젯 대신 커스텀 흐름이 필요하면 아래 단계를 따르세요. 모든 단계는 클라이언트 사이드에서 REST API를 직접 사용합니다.

```
1. 결제 생성 (REST API — 클라이언트)
       ↓
2. 토큰 Approve 확인 (프론트엔드)
       ↓
3. EIP-712 서명 요청 (프론트엔드)
       ↓
4. 가스리스 요청 제출 (REST API — 클라이언트)
       ↓
5. 상태 확인 (REST API — 클라이언트)
```

## Step 1: 결제 생성

`x-public-key` 헤더와 함께 `POST /payments`를 호출합니다. 브라우저에서 직접 호출할 수 있습니다.

```typescript
const response = await fetch('https://pay-api.staging.sut.com/api/v1/payments', {
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
// payment: paymentId, forwarderAddress, gatewayAddress, amount, serverSignature 등 포함
```

::: warning forwarderAddress 확인
해당 체인에서 가스리스를 사용하려면 `payment.forwarderAddress`가 반드시 있어야 합니다.
:::

## Step 2: 토큰 Approve

가스리스 결제에서도 릴레이어는 사용자가 먼저 **PaymentGateway 컨트랙트에 토큰 사용 권한을 부여하는 `approve` 트랜잭션을 완료**해야만 토큰을 전송할 수 있습니다.

```typescript
import { useWriteContract, useReadContract } from 'wagmi';

// 1. 기존 allowance 확인
const { data: allowance } = useReadContract({
  address: tokenAddress,
  abi: ERC20ABI,
  functionName: 'allowance',
  args: [userAddress, gatewayAddress],
});

// 2. 부족하면 Approve 트랜잭션 전송 (1회 설정 시 사용자가 가스 지불)
if (allowance < BigInt(amount)) {
  await writeContract({
    address: tokenAddress,
    abi: ERC20ABI,
    functionName: 'approve',
    args: [gatewayAddress, amount],
  });
}
```

::: info Permit(서명 Approve) 지원 토큰
USDC처럼 `Permit`(EIP-2612)를 지원하는 토큰은 `approve` 트랜잭션을 서명으로 대체할 수 있습니다.
**공식 SoloPay 위젯(`@solo-pay/widget-js` 또는 `@solo-pay/widget-react`)을 사용하면 EIP-2612 지원을 자동 감지하여 1회 `approve` 트랜잭션을 건너뛰고, Permit을 서명만으로 완전 가스리스 처리합니다.**
:::

::: tip
충분한 금액이 approve 되면 이후 모든 결제(Step 3)는 **서명만으로** 완전 가스리스가 가능합니다.
:::

## Step 3: EIP-712 서명 요청

프론트엔드에서 사용자에게 서명을 요청합니다.

```typescript
import { useSignTypedData } from 'wagmi';
import { encodeFunctionData } from 'viem';

const { signTypedDataAsync } = useSignTypedData();

// Forwarder에서 현재 nonce 조회
const nonce = await publicClient.readContract({
  address: forwarderAddress,
  abi: ERC2771ForwarderABI,
  functionName: 'nonces',
  args: [userAddress],
});

// Forward Request 구성 (PaymentGateway.pay — deadline/escrowDuration은 API 응답에서 사용)
const forwardRequest = {
  from: userAddress,
  to: gatewayAddress,
  value: 0n,
  gas: 200000n,
  nonce,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1시간
  data: encodeFunctionData({
    abi: PaymentGatewayABI,
    functionName: 'pay',
    args: [
      paymentId,
      tokenAddress,
      BigInt(amount),
      recipientAddress,
      merchantId,
      BigInt(deadline), // payment.deadline (API)
      BigInt(escrowDuration), // payment.escrowDuration (API)
      serverSignature,
      permitData, // EIP-2612 permit, 또는 zero permit { deadline: 0, v: 0, r: '0x00...', s: '0x00...' }
    ],
  }),
};

// EIP-712 서명 — domain name/version은 릴레이 API가 사용하는 forwarder 컨트랙트와 일치해야 함 (예: SoloPay, SoloForwarder, ERC2771Forwarder)
const signature = await signTypedDataAsync({
  domain: {
    name: 'ERC2771Forwarder', // 배포된 forwarder와 일치해야 함; 릴레이 서버가 검증함
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

::: warning 중요
서명은 트랜잭션이 아니므로 **가스비가 부과되지 않습니다**.
`pay` 함수는 API 응답의 `deadline`, `escrowDuration`, `serverSignature`가 필요합니다. EIP-2612를 사용하지 않을 때는 zero permit을 전달하세요.
:::

## Step 4: 가스리스 요청 제출

**엔드포인트**: `POST /payments/:id/relay`

```typescript
const result = await fetch(
  `https://pay-api.staging.sut.com/api/v1/payments/${payment.paymentId}/relay`,
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

## Step 5: 상태 확인

```typescript
// 릴레이 상태 (paymentId 기준)
const relayStatus = await fetch(
  `https://pay-api.staging.sut.com/api/v1/payments/${paymentId}/relay`,
  { headers: { 'x-public-key': 'pk_test_xxxxx' } }
).then((r) => r.json());
// relayStatus.data.status: 'QUEUED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED'

// 결제 상태
const paymentStatus = await fetch(`https://pay-api.staging.sut.com/api/v1/payments/${paymentId}`, {
  headers: { 'x-public-key': 'pk_test_xxxxx' },
}).then((r) => r.json());
// paymentStatus.data.status: 'CREATED' | 'ESCROWED' | 'FINALIZE_SUBMITTED' | 'FINALIZED' | 'CANCEL_SUBMITTED' | 'CANCELLED' | 'REFUND_SUBMITTED' | 'REFUNDED' | 'EXPIRED' | 'FAILED'
```

## 전체 예시 (React + wagmi)

```typescript
function GaslessPayment({ payment }) {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { signTypedDataAsync } = useSignTypedData();

  const { paymentId, forwarderAddress, gatewayAddress, amount, tokenAddress,
          recipientAddress, merchantId, deadline, escrowDuration, serverSignature, chainId } = payment;

  const handleGaslessPayment = async () => {
    const nonce = await publicClient.readContract({
      address: forwarderAddress, abi: ERC2771ForwarderABI,
      functionName: 'nonces', args: [address],
    });

    const payDeadline = BigInt(deadline);
    const payEscrowDuration = BigInt(escrowDuration);
    const zeroPermit = { deadline: 0, v: 0, r: '0x0000000000000000000000000000000000000000000000000000000000000000' as const, s: '0x0000000000000000000000000000000000000000000000000000000000000000' as const };

    const forwardRequest = {
      from: address, to: gatewayAddress, value: 0n, gas: 200000n, nonce,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      data: encodeFunctionData({
        abi: PaymentGatewayABI, functionName: 'pay',
        args: [paymentId, tokenAddress, BigInt(amount), recipientAddress, merchantId, payDeadline, payEscrowDuration, serverSignature, zeroPermit],
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
      `https://pay-api.staging.sut.com/api/v1/payments/${paymentId}/relay`,
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

  return <button onClick={handleGaslessPayment}>가스 없이 결제</button>;
}
```

## 에러 처리

| 에러 코드                | 원인                                                 | 해결 방법                                          |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------- |
| `INVALID_SIGNATURE`      | 잘못된 서명 형식                                     | 서명이 `0x`로 시작하는 hex 문자열인지 확인         |
| `INVALID_PAYMENT_STATUS` | 결제가 종료 상태(예: ESCROWED, FINALIZED, CANCELLED) | status가 CREATED일 때만 relay 전송; 중복 요청 방지 |
| `PAYMENT_EXPIRED`        | 결제 만료                                            | 새 결제 생성 후 재시도                             |
| `RELAYER_NOT_CONFIGURED` | 해당 체인에 릴레이어 없음                            | 지원 체인 확인                                     |
| `VALIDATION_ERROR`       | 입력 검증 실패                                       | forwardRequest 금액이 결제 금액과 일치하는지 확인  |

## 다음 단계

- [Webhook 설정](/ko/webhooks/) - 결제 완료 알림 수신
- [에러 코드](/ko/api/errors) - 전체 에러 목록
