---
id: SPEC-DEMO-002
type: plan
version: '1.0.2'
status: 'draft'
created: '2025-12-01'
updated: '2025-12-01'
---

# SPEC-DEMO-002 구현 계획 (수정됨)

## 📊 Overview

**SPEC ID**: SPEC-DEMO-002
**Title**: Demo App 서버 기반 블록체인 설정 적용
**Parent SPEC**: SPEC-API-001
**Priority**: High
**Estimated Time**: **3.5-4시간** ← 4.5-5시간에서 감소 (PaymentModal 이미 구현됨)

> **⚠️ 보안 필수사항 - 금액 조작 방지**
>
> 프론트엔드에서 `amount`를 직접 서버로 전송하면 안됩니다!
>
> **올바른 구현**:
>
> 1. 프론트엔드 → Next.js API Route: `productId`만 전송
> 2. Next.js API Route: 상품 가격 조회 (constants/DB)
> 3. Next.js API Route → 결제서버: 조회된 가격으로 API 호출

**⚠️ 중요 변경사항**:

- 경로 변경: `packages/demo-app/` → `apps/demo/`
- zod 설치 단계 추가 (Phase 0)
- PaymentModal 수정 범위 축소 (이미 441줄 구현됨)
- **[보안] PaymentModal props에서 `amount` 제거, `productId` 추가**

---

## 🎯 구현 목표

1. **서버 API 통합**: `/payments/create` API 호출하여 블록체인 설정 로드
2. **레거시 코드 제거**: wagmi.ts의 LEGACY_CONTRACTS, getContractsForChain() 삭제
3. **에러 처리 강화**: API 재시도, 캐싱, 로딩 상태 표시
4. **테스트 커버리지 90%**: 모든 주요 기능에 대한 테스트 작성
5. **[보안] 금액 조작 방지**: `productId`만 전송, 서버에서 가격 조회

---

## 📋 Phase 0: 환경 설정 (5분) ← 새로 추가

### 0.1 zod 설치

**명령어**:

```bash
cd apps/demo
pnpm add zod
```

**체크포인트**: package.json에 zod 추가 확인

---

## 📋 Phase 1: API 클라이언트 함수 추가 (45분)

### 1.1 Zod 스키마 정의 (15분)

**파일**: `apps/demo/src/lib/api.ts` (기존 파일에 추가)

**옵션 A** (권장): 기존 `lib/api.ts`에 직접 추가
**옵션 B**: `apps/demo/src/types/api.ts` 새로 생성하여 분리

권장: **옵션 A** (간단하고 유지보수 용이)

```typescript
import { z } from 'zod';

// ===== Request Schema =====
export const CreatePaymentRequestSchema = z.object({
  merchantId: z.string().min(1),
  amount: z.number().positive(),
  currency: z.enum(['USDC', 'USDT']),
  chainId: z.number().positive(),
  description: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

// ===== Response Schema =====
export const CreatePaymentResponseSchema = z.object({
  paymentId: z.string(),
  tokenAddress: z.string(),
  gatewayAddress: z.string(),
  amount: z.string(),
  currency: z.string(),
  chainId: z.number(),
  expiresAt: z.string(),
});

export type CreatePaymentResponse = z.infer<typeof CreatePaymentResponseSchema>;

// ===== API Response Wrapper =====
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
        details: z.unknown().optional(),
      })
      .optional(),
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
};
```

**체크포인트**: TypeScript 컴파일 통과 확인

### 1.2 createPayment() 함수 구현 (20분)

**파일**: `apps/demo/src/lib/api.ts` (기존 파일에 추가)

```typescript
import {
  CreatePaymentRequest,
  CreatePaymentRequestSchema,
  CreatePaymentResponse,
  CreatePaymentResponseSchema,
  ApiResponse,
  ApiResponseSchema,
} from '@/lib/api'; // 같은 파일에 있으므로 생략 가능

// ===== 환경 변수 =====
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1초

// ===== 에러 코드 =====
export enum ApiErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// ===== 재시도 헬퍼 함수 =====
async function retryWithDelay<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delay: number = RETRY_DELAY
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0 && isRetryableError(error)) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return retryWithDelay(fn, retries - 1, delay);
    }
    throw error;
  }
}

function isRetryableError(error: unknown): boolean {
  // 5xx 에러만 재시도
  if (error instanceof Error && 'status' in error) {
    const status = (error as any).status;
    return status >= 500 && status < 600;
  }
  return false;
}

// ===== createPayment() API 함수 =====
export async function createPayment(
  request: CreatePaymentRequest
): Promise<ApiResponse<CreatePaymentResponse>> {
  try {
    // 1. 요청 데이터 검증
    const validatedRequest = CreatePaymentRequestSchema.parse(request);

    // 2. API 호출 (재시도 로직 포함)
    const response = await retryWithDelay(async () => {
      const res = await fetch(`${API_BASE_URL}/api/payments/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(validatedRequest),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const error: any = new Error(`HTTP ${res.status}: ${res.statusText}`);
        error.status = res.status;
        error.data = errorData;
        throw error;
      }

      return res;
    });

    // 3. 응답 데이터 파싱 및 검증
    const rawData = await response.json();
    const parsedResponse = ApiResponseSchema(CreatePaymentResponseSchema).parse(rawData);

    return parsedResponse;
  } catch (error) {
    // 4. 에러 처리
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.VALIDATION_ERROR,
          message: 'Invalid request or response data',
          details: error.errors,
        },
      };
    }

    if (error instanceof Error && 'status' in error) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.SERVER_ERROR,
          message: error.message,
          details: (error as any).data,
        },
      };
    }

    return {
      success: false,
      error: {
        code: ApiErrorCode.UNKNOWN_ERROR,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}
```

**체크포인트**: ESLint 검증, 타입 에러 0개 확인

### 1.3 Unit Tests 작성 (10분)

**파일**: `apps/demo/src/lib/api.test.ts`

(테스트 코드는 동일하므로 생략 - 원본 계획 참조)

**체크포인트**: `pnpm test api.test.ts` 실행하여 모든 테스트 통과 확인

---

## 📋 Phase 2: PaymentModal.tsx 수정 (1.5시간) ← 2.5시간에서 감소

### 🎯 현재 구현 상태

✅ **이미 구현된 기능** (apps/demo/src/components/PaymentModal.tsx, 441줄):

- useAccount, useWalletClient, useChainId 사용
- Token approval 처리
- Direct payment 처리
- Payment status polling (2초 간격, 최대 30회)
- Error handling
- Dark mode 지원

❌ **수정 필요 사항**:

- Line 12: `getContractsForChain` import 제거
- Line 106-107: `getContractsForChain()` 호출 제거
- Line 218-229: 하드코딩된 주소를 서버 응답 주소로 변경

🆕 **추가 필요 사항**:

- `createPayment()` 함수 호출 추가
- 서버 응답 상태 관리 (serverConfig)
- 로딩/에러 UI 개선

### 2.1 Import 변경 및 State 추가 (20분)

**파일**: `apps/demo/src/components/PaymentModal.tsx`

```typescript
import { useEffect, useState } from 'react';
import { useAccount, useWalletClient, useChainId } from 'wagmi';
import { parseUnits, erc20Abi } from 'viem';
import { getTokenForChain } from '@/lib/wagmi'; // ✅ UI 표시용 유지
// ❌ 제거: import { getContractsForChain } from '@/lib/wagmi';
import { createPayment } from '@/lib/api'; // 🆕 서버 API
import { CreatePaymentResponse } from '@/lib/api'; // 🆕 타입

// ===== State 추가 =====
// ⚠️ 보안: amount 대신 productId 사용!
interface PaymentModalProps {
  productId: string; // ✅ 보안: productId만 전송, amount 절대 불가!
  merchantId: string;
  chainId: number;
  currency: 'USDC' | 'USDT';
  onClose: () => void;
  onSuccess: () => void;
  // ❌ amount: number; // 보안 취약점 - 금액 조작 가능!
}

export function PaymentModal({
  productId, // ✅ 보안: productId만 받음
  merchantId,
  chainId,
  currency,
  onClose,
  onSuccess,
}: PaymentModalProps) {
  const { address, isConnected } = useAccount();

  // ✅ 보안: 가격은 서버에서 조회 (Next.js API Route가 처리)

  // 🆕 서버 설정 상태
  const [serverConfig, setServerConfig] = useState<CreatePaymentResponse | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  // 기존 상태들 (이미 구현됨)
  // ...
}
```

(이하 생략 - 원본 계획의 2.2, 2.3, 2.4, 2.5 섹션과 동일하지만 경로만 수정)

---

## 📋 Phase 3: wagmi.ts 정리 (30분)

### 3.1 LEGACY_CONTRACTS 삭제 (15분)

**파일**: `apps/demo/src/lib/wagmi.ts`

**삭제할 코드** (Line 58-75):

```typescript
// ❌ 삭제
// const LEGACY_CONTRACTS = { ... };
// export function getContractsForChain(chainId: number) { ... }
```

**유지할 코드**:

```typescript
// ✅ 유지: getTokenForChain() - UI 표시용
export function getTokenForChain(chainId: number) {
  // ...
}
```

**체크포인트**: `git grep LEGACY_CONTRACTS apps/demo/src` 결과가 0개

### 3.2 검증 스크립트 실행 (15분)

**파일**: `apps/demo/scripts/verify-cleanup.sh` (새 파일)

```bash
#!/bin/bash

echo "🔍 Verifying legacy code cleanup..."

# AC-6: LEGACY_CONTRACTS 검색
LEGACY_COUNT=$(git grep -c "LEGACY_CONTRACTS" apps/demo/src || echo "0")

if [ "$LEGACY_COUNT" != "0" ]; then
  echo "❌ FAILED: LEGACY_CONTRACTS still exists!"
  git grep -n "LEGACY_CONTRACTS" apps/demo/src
  exit 1
fi

# getContractsForChain 검색
GET_CONTRACTS_COUNT=$(git grep -c "getContractsForChain" apps/demo/src || echo "0")

if [ "$GET_CONTRACTS_COUNT" != "0" ]; then
  echo "❌ FAILED: getContractsForChain still exists!"
  git grep -n "getContractsForChain" apps/demo/src
  exit 1
fi

# getTokenForChain은 유지되어야 함
GET_TOKEN_COUNT=$(git grep -c "getTokenForChain" apps/demo/src || echo "0")

if [ "$GET_TOKEN_COUNT" == "0" ]; then
  echo "❌ FAILED: getTokenForChain was removed (should be kept)!"
  exit 1
fi

echo "✅ PASSED: All legacy code removed successfully!"
echo "✅ PASSED: getTokenForChain is kept for UI display!"
exit 0
```

**실행**: `chmod +x scripts/verify-cleanup.sh && ./scripts/verify-cleanup.sh`

**체크포인트**: 스크립트 통과 확인

---

## 📋 Phase 4: 통합 테스트 및 품질 검증 (1-1.5시간)

(내용 동일 - 경로만 `apps/demo`로 수정)

### 4.1 Integration Tests (30분)

**파일**: `apps/demo/src/__tests__/integration/payment-flow.test.tsx`

(코드 동일)

### 4.2 TypeScript / ESLint / Coverage 검증 (20분)

```bash
cd apps/demo

# TypeScript 컴파일 에러 확인 (NFR-3)
pnpm type-check

# ESLint 검증
pnpm lint

# 전체 테스트 + 커버리지 (AC-7, NFR-2)
pnpm test -- --coverage

# 커버리지 검증
# - api.ts: 95%+
# - PaymentModal.tsx: 90%+
# - wagmi.ts: 85%+
```

---

## ✅ Rollback Plan (위험 완화)

(내용 동일 - 경로만 `apps/demo`로 수정)

---

## 📊 성공 지표

| 지표                 | 목표 | 검증 방법                     |
| -------------------- | ---- | ----------------------------- |
| **테스트 커버리지**  | ≥90% | `pnpm test -- --coverage`     |
| **TypeScript 에러**  | 0개  | `pnpm type-check`             |
| **ESLint 에러**      | 0개  | `pnpm lint`                   |
| **API 응답 시간**    | ≤3초 | 통합 테스트 로그 확인         |
| **번들 크기 증가**   | <5KB | `pnpm build` 후 크기 확인     |
| **레거시 코드 제거** | 100% | `./scripts/verify-cleanup.sh` |

---

## 🚀 Next Steps (SPEC-DEMO-002 완료 후)

1. **Production 배포 준비**:
   - 환경 변수 설정 (NEXT_PUBLIC_API_BASE_URL)
   - 프로덕션 빌드 테스트
   - 성능 모니터링 설정

2. **추가 개선 사항**:
   - 서버 설정 캐싱 (localStorage)
   - 에러 로깅 (Sentry)
   - Analytics 추가 (Google Analytics)

3. **문서화**:
   - `/moai:3-sync SPEC-DEMO-002` 실행
   - API 사용법 문서 작성
   - 배포 가이드 작성

---

**Status**: Draft (Updated)
**Last Updated**: 2025-12-01
**Estimated Total Time**: **3.5-4시간** ← 4.5-5시간에서 감소
**Version**: 1.0.1 (경로 수정 반영)
