# 결제 동작 원리 및 핵심 아키텍처

SoloPay의 전체 결제 파이프라인과 가스리스 아키텍처를 설명합니다.

## 2.1 전체 결제 파이프라인

모든 SoloPay 결제는 아래 5단계로 처리됩니다.

```
[1] SoloPay 위젯
    POST /payments 호출 → paymentId, serverSignature 수신

         ↓

[2] 사용자 지갑 (MetaMask)
    EIP-712 서명 생성 (트랜잭션 없음, 가스비 없음)

         ↓

[3] SoloPay 릴레이어
    서명 수신 → 서명 검증 → 온체인 TX 전송

         ↓

[4] 블록체인 (PaymentGateway 컨트랙트)
    payWithSignature() 실행 → 토큰 이동 & 이벤트 발생

         ↓

[5] SoloPay → 가맹점 서버
    결제 완료/실패 Webhook 이벤트 전송
```

### 단계별 설명

| 단계                 | 주체         | 작업                                                          |
| -------------------- | ------------ | ------------------------------------------------------------- |
| **1. 결제 요청**     | SoloPay 위젯 | `POST /payments` 호출 → `paymentId`, `serverSignature` 수신   |
| **2. 서명**          | 사용자 지갑  | MetaMask에서 EIP-712 서명만 수행 (트랜잭션 없음, 가스비 없음) |
| **3. 릴레이어 처리** | SoloPay 서버 | `POST /payments/:id/relay` 수신 → 서명 검증 → 온체인 TX 전송  |
| **4. 컨트랙트 실행** | 블록체인     | `PaymentGateway.payWithSignature()` 실행 → 토큰 이동          |
| **5. Webhook 알림**  | SoloPay 서버 | 결제 완료/실패 이벤트를 가맹점 Webhook URL로 전송             |

## 2.2 가스리스(Gasless) 및 릴레이어(Relayer) 시스템

### 일반 결제 vs 가스리스 결제

```
일반 결제 (Direct Pay)                가스리스 결제 (Gasless Pay)
────────────────────                  ────────────────────────────

  사용자                                  사용자
    │                                       │
    │ ① 트랜잭션 직접 전송                   │ ① 서명(Signature) 데이터만 생성
    │   (가스비: 사용자 부담)                 │   (트랜잭션 없음, 가스비 없음)
    ▼                                       ▼
PaymentGateway 컨트랙트              SoloPay 위젯 → SoloPay 릴레이어
                                             │
                                             │ ② 서명 검증 후 TX 전송
                                             │   (가스비: 릴레이어 부담)
                                             ▼
                                    PaymentGateway 컨트랙트
```

### 릴레이어의 역할

릴레이어(Relayer)는 SoloPay가 운영하는 서버입니다. 가스리스 결제의 핵심 중계자 역할을 합니다.

1. **서명 수신**: SoloPay 위젯으로부터 사용자의 EIP-712 서명 데이터를 받습니다.
2. **서명 검증**: EIP-712 서명이 올바른 포맷인지, 사용자 주소와 일치하는지 검증합니다.
3. **가스비 대납**: 릴레이어 지갑에서 가스비를 지불하고 `ERC2771Forwarder` 컨트랙트를 통해 `PaymentGateway`에 트랜잭션을 전송합니다.
4. **상태 모니터링**: 트랜잭션의 온체인 상태를 추적합니다 (`QUEUED` → `SUBMITTED` → `CONFIRMED`/`FAILED`).

::: info ERC-2771 메타트랜잭션
SoloPay는 OpenZeppelin의 `ERC2771Forwarder` 표준을 사용합니다. 이를 통해 릴레이어가 트랜잭션을 대신 전송하더라도, 컨트랙트 측에서는 원래 사용자(서명자)를 정확히 식별할 수 있습니다.
:::

## 2.3 토큰별 가스리스 동작 방식 (Permit 지원 여부)

토큰의 `Permit(EIP-2612)` 지원 여부에 따라 가스리스 수준이 달라집니다.

### A. 완벽한 가스리스 — Permit 지원 토큰 (예: USDC)

EIP-2612 Permit을 지원하는 토큰은 최초 결제 시에도 Approve 트랜잭션 없이 **서명(Signature) 하나만으로** 모든 과정이 처리됩니다.

```
최초 결제 포함 모든 결제:

  사용자
    │
    │ ① EIP-2612 Permit 서명 (가스비 없음)
    │ ② EIP-712 ForwardRequest 서명 (가스비 없음)
    ▼
  릴레이어 → 컨트랙트 실행 (가스비: 릴레이어 부담)

→ 사용자 가스비 지출: 0원
```

SoloPay 결제 위젯을 사용하면 Permit 지원 여부를 자동 감지하여 처리합니다.

### B. 부분 가스리스 — Permit 미지원 토큰 (일반 ERC-20)

일반 ERC-20 토큰(Permit 미지원)은 `allowance` 방식의 사전 승인이 필요합니다.

**최초 1회 (사용자 가스비 발생)**

```
  사용자
    │
    │ ① approve(gatewayAddress, 무한 승인) 트랜잭션 전송
    │   (가스비: 사용자 부담 — 1회만 발생)
    ▼
  PaymentGateway 컨트랙트에 allowance 등록
```

**이후 모든 결제 (완전 가스리스)**

```
  사용자
    │
    │ ① EIP-712 ForwardRequest 서명 (가스비 없음)
    ▼
  릴레이어 → 컨트랙트 실행 (가스비: 릴레이어 부담)

→ 두 번째 결제부터는 가스비 없음
```

::: tip 무한 승인 (Infinite Approve) 권장
최초 1회 Approve 시 최대값(`BigInt(2**256 - 1)`)으로 승인해두면, 이후 수백 번의 결제도 추가 Approve 없이 진행됩니다.
:::

### Permit 지원 여부 비교표

| 항목             | Permit 지원 토큰 (USDC 등) | 일반 ERC-20             |
| ---------------- | -------------------------- | ----------------------- |
| 최초 결제 가스비 | 없음 ✅                    | 있음 (1회) ⚠️           |
| 이후 결제 가스비 | 없음 ✅                    | 없음 ✅                 |
| 구현 복잡도      | 낮음                       | 낮음 (Approve 1회 추가) |

## 2.4 트랜잭션 상태 사이클

### 결제(Payment) 상태

```
CREATED ──────▶ PENDING ──────▶ CONFIRMED
    │               │
    ▼               ▼
 EXPIRED          FAILED
(30분 초과)    (TX 실패 또는 검증 실패)
```

| 상태        | 설명                                            |
| ----------- | ----------------------------------------------- |
| `CREATED`   | 결제 생성 완료, 사용자 액션(서명/트랜잭션) 대기 |
| `PENDING`   | 트랜잭션이 블록체인에 제출됨, 확정 대기         |
| `CONFIRMED` | 블록 확정 완료 — 결제 성공                      |
| `FAILED`    | 트랜잭션 실패 또는 서명 검증 실패               |
| `EXPIRED`   | 결제 생성 후 30분 초과로 만료                   |

### Relay 상태 (가스리스 전용)

```
QUEUED ──────▶ SUBMITTED ──────▶ CONFIRMED
                    │
                    ▼
                  FAILED
```

| 상태        | 설명                                         |
| ----------- | -------------------------------------------- |
| `QUEUED`    | 릴레이어가 서명 데이터 수신, TX 전송 준비 중 |
| `SUBMITTED` | 릴레이어가 블록체인에 TX 전송 완료           |
| `CONFIRMED` | TX가 블록에 포함되어 확정                    |
| `FAILED`    | TX 실패 (가스 부족, 컨트랙트 revert 등)      |

::: info 결제 상태 vs Relay 상태

- **결제 상태**는 최종 결제의 온체인 확정 여부입니다.
- **Relay 상태**는 릴레이어의 TX 제출 과정 상태입니다.
- Relay가 `CONFIRMED`가 되면 결제 상태도 `CONFIRMED`로 전환됩니다.
  :::

## 다음 단계

- [스마트 컨트랙트 정보](/ko/developer/smart-contracts) — 컨트랙트 주소 및 ABI
- [클라이언트 사이드 연동](/ko/developer/client-side) — 단계별 구현 가이드
