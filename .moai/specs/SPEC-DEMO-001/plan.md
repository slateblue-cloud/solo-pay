---
id: SPEC-DEMO-001
tag: SPEC-DEMO-001
version: '1.0.0'
status: 'draft'
created: '2025-11-30'
updated: '2025-11-30'
---

# SPEC-DEMO-001 구현 계획

## 프로젝트 현황 (2025-11-30 기준)

### ✅ 완료된 작업

| SPEC            | 설명                               | 상태    | 테스트 커버리지 |
| --------------- | ---------------------------------- | ------- | --------------- |
| SPEC-SERVER-002 | 무상태 결제 서버 API               | ✅ 완료 | 82.89% (65개)   |
| SPEC-SDK-001    | 상점서버용 SDK (@globalmsq/msqpay) | ✅ 완료 | 100% (26개)     |
| Smart Contracts | PaymentGateway + ERC2771Forwarder  | ✅ 완료 | 16개            |

### 📊 전체 진행률: ~90%

---

## 구현 단계

### Phase 1: 의존성 및 SDK 초기화 (15분)

#### Step 1.1: SDK 의존성 추가

**작업 내용**:

```json
// apps/demo/package.json에 추가
"dependencies": {
  "@globalmsq/msqpay": "workspace:*"
}
```

**실행 명령어**:

```bash
# 모노리포 루트에서 실행
pnpm install
```

**검증**:

- `node_modules/@globalmsq/msqpay` symlink 생성 확인
- `pnpm list @globalmsq/msqpay` 실행 성공

---

#### Step 1.2: SDK Singleton 생성

**파일**: `apps/demo/src/lib/msqpay-server.ts` (NEW - 20 lines)

**구현 내용**:

```typescript
import { MSQPayClient } from '@globalmsq/msqpay';

let msqpayClient: MSQPayClient | null = null;

export function getMSQPayClient(): MSQPayClient {
  if (!msqpayClient) {
    msqpayClient = new MSQPayClient({
      environment: 'development',
      apiKey: process.env.MSQPAY_API_KEY || 'dev-key-not-required',
    });
  }
  return msqpayClient;
}
```

**핵심 원칙**:

- Singleton 패턴으로 인스턴스 재사용
- 환경 변수로 API Key 관리
- `environment: 'development'`로 localhost:3001 자동 연결

---

### Phase 2: API Routes 생성 (30분)

#### Directory Structure

```
apps/demo/src/app/api/payments/
├── [paymentId]/
│   ├── status/route.ts    # GET - 결제 상태 조회
│   ├── gasless/route.ts   # POST - Gasless 거래 제출
│   └── relay/route.ts     # POST - Relay 거래 실행
└── history/route.ts       # GET - 결제 이력 조회
```

---

#### Step 2.1: Payment Status Route (~25 lines)

**파일**: `apps/demo/src/app/api/payments/[paymentId]/status/route.ts`

**구현 내용**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getMSQPayClient } from '@/lib/msqpay-server';

export async function GET(request: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    const client = getMSQPayClient();
    const response = await client.getPaymentStatus(params.paymentId);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
```

**API 설명**:

- Endpoint: `GET /api/payments/{paymentId}/status`
- SDK 메서드: `client.getPaymentStatus()`
- 응답: 결제 상태 객체 또는 에러

---

#### Step 2.2: Payment History Route (~30 lines)

**파일**: `apps/demo/src/app/api/payments/history/route.ts`

**구현 내용**:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const payer = searchParams.get('payer');

    if (!payer) {
      return NextResponse.json(
        { success: false, message: 'payer address required' },
        { status: 400 }
      );
    }

    // 임시: Payment Server API 직접 호출 (SDK 메서드 없음)
    const response = await fetch(`http://localhost:3001/api/payments/history?payer=${payer}`);
    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
```

**API 설명**:

- Endpoint: `GET /api/payments/history?payer={address}`
- 현재: Payment Server API 직접 호출 (SDK 메서드 부재)
- 향후: SDK에 `getPaymentHistory()` 추가 후 업데이트

---

#### Step 2.3: Gasless Route (~30 lines)

**파일**: `apps/demo/src/app/api/payments/[paymentId]/gasless/route.ts`

**구현 내용**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getMSQPayClient } from '@/lib/msqpay-server';

export async function POST(request: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    const client = getMSQPayClient();
    const body = await request.json();

    const response = await client.submitGasless({
      paymentId: params.paymentId,
      ...body,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
```

**API 설명**:

- Endpoint: `POST /api/payments/{paymentId}/gasless`
- SDK 메서드: `client.submitGasless()`
- Request Body: 거래 데이터

---

#### Step 2.4: Relay Route (~30 lines)

**파일**: `apps/demo/src/app/api/payments/[paymentId]/relay/route.ts`

**구현 내용**:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getMSQPayClient } from '@/lib/msqpay-server';

export async function POST(request: NextRequest, { params }: { params: { paymentId: string } }) {
  try {
    const client = getMSQPayClient();
    const body = await request.json();

    const response = await client.executeRelay({
      paymentId: params.paymentId,
      ...body,
    });

    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    );
  }
}
```

**API 설명**:

- Endpoint: `POST /api/payments/{paymentId}/relay`
- SDK 메서드: `client.executeRelay()`
- Request Body: 거래 데이터

---

### Phase 3: Frontend 통합 (15분)

#### Step 3.1: API URL 변경 (1 line)

**파일**: `apps/demo/src/lib/api.ts`

**변경 내용**:

```typescript
// BEFORE:
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// AFTER:
const API_URL = '/api'; // Next.js API Routes (same origin)
```

**영향**:

- Frontend 코드 **전혀 수정 안 함** (100% backward compatible)
- React 컴포넌트 무수정
- 기존 함수 시그니처 유지

**검증**:

```bash
# Frontend 빌드 성공 확인
cd apps/demo && pnpm build
```

---

### Phase 4: 환경 설정 (5분)

#### Step 4.1: 환경 변수 파일 생성

**파일**: `apps/demo/.env.local` (NEW - 5 lines)

**내용**:

```bash
MSQPAY_API_KEY=dev-key-not-required

# Note: SDK가 environment: 'development' 사용
# Payment Server: http://localhost:3001
```

**설명**:

- `MSQPAY_API_KEY`: 서버사이드 환경 변수 (Frontend 노출 안 됨)
- SDK가 `development` 모드에서 localhost:3001 자동 연결

---

## 구현 우선순위

### Top 5 Critical Files

#### 1. `apps/demo/src/lib/msqpay-server.ts` (NEW)

- SDK singleton 초기화
- 모든 API Routes의 core
- 우선순위: **최우선** (모든 route 의존)

#### 2. `apps/demo/src/app/api/payments/[paymentId]/status/route.ts` (NEW)

- 가장 자주 호출되는 endpoint (polling)
- 우선순위: **High**

#### 3. `apps/demo/src/lib/api.ts` (MODIFY)

- 1줄 변경으로 전체 frontend redirect
- 우선순위: **Critical**

#### 4. `apps/demo/package.json` (MODIFY)

- SDK 의존성 추가
- 모든 코드 동작의 전제조건
- 우선순위: **선행 필수**

#### 5. `apps/demo/src/app/api/payments/history/route.ts` (NEW)

- 사용자 visible 기능
- 우선순위: **Medium**

---

## 기술 스택

### 프레임워크 및 라이브러리

- **Next.js**: 14.2.5 (App Router)
- **TypeScript**: 5.x
- **MSQPay SDK**: @globalmsq/msqpay (workspace:\*)
- **Package Manager**: pnpm workspace

### 개발 환경

- **Node.js**: 18.x 이상
- **Payment Server**: http://localhost:3001
- **Demo App**: http://localhost:3000

---

## 테스트 전략

### 수동 테스트 체크리스트

#### 환경 준비

```bash
# Terminal 1: Payment Server 실행
cd packages/pay-server && pnpm dev  # Port 3001

# Terminal 2: SDK 설치
cd apps/demo && pnpm install

# Terminal 3: Demo App 실행
cd apps/demo && pnpm dev  # Port 3000
```

#### 테스트 시나리오

##### Scenario 1: Payment Status 조회

1. 브라우저: http://localhost:3000
2. 상품 구매 → 결제 진행
3. DevTools Network 탭: `GET /api/payments/{id}/status` 응답 200 확인
4. 결제 상태 UI 정상 표시 확인

##### Scenario 2: Payment History 확인

1. 이력 섹션 확인
2. Network 탭: `GET /api/payments/history?payer={address}` 응답 200 확인
3. 결제 목록 UI 정상 표시 확인

##### Scenario 3: 에러 처리

1. Payment Server 종료 (Terminal 1에서 Ctrl+C)
2. Frontend에서 결제 시도
3. 에러 메시지 확인 (500 status)
4. Payment Server 재시작
5. 결제 복구 확인

---

## 리스크 분석

### Risk 1: Monorepo Workspace 의존성

**문제**: `workspace:*` 링크 해결 실패 가능성

**완화 전략**:

- 모노리포 루트에서 `pnpm install` 실행
- symlink 확인: `ls -la node_modules/@globalmsq/msqpay`

**롤백 방안**:

- 필요시 `"file:../../packages/sdk"` 사용

### Risk 2: SDK 메서드 부족

**문제**: SDK에 `getPaymentHistory()` 메서드 없음

**현재 해결**:

- Route에서 Payment Server API 직접 호출 (임시)

**향후 개선**:

- SDK에 메서드 추가 후 route 업데이트
- 별도 SPEC (SPEC-SDK-002) 생성 고려

### Risk 3: Payment Server 연결 실패

**문제**: SDK가 `http://localhost:3001` 접근 불가

**완화 전략**:

- `http://localhost:3001/health` 브라우저 확인
- Payment Server 실행 상태 확인
- API Routes에 에러 처리 포함

**모니터링**:

- 서버 로그 확인
- Network 탭에서 요청/응답 검증

---

## 성공 기준

### 필수 요구사항

- ✅ Frontend가 `/api/payments/*` 호출
- ✅ API Routes가 `MSQPayClient` 사용
- ✅ 기존 결제 플로우 무수정 동작
- ✅ Payment History 정상 표시
- ✅ 에러 처리 유지

### 품질 기준

- ✅ TypeScript 타입 에러 없음
- ✅ ESLint 경고 없음
- ✅ 빌드 성공 (`pnpm build`)
- ✅ 모든 시나리오 테스트 통과

---

## 구현 요약

### 총 작업량

- **신규 파일**: 6개 (~140 lines)
- **수정 파일**: 2개 (2 lines)
- **환경 설정**: 1개 (~5 lines)
- **총합**: 8 파일, ~147 lines

### 핵심 원칙

1. ✅ **Minimal Change** - 기존 코드 2줄만 수정
2. ✅ **Zero Frontend Impact** - React 컴포넌트 무수정
3. ✅ **Thin Wrapper** - API Routes는 SDK 단순 forwarding
4. ✅ **Singleton Pattern** - SDK 인스턴스 재사용
5. ✅ **Backward Compatible** - 기존 API 100% 호환

---

## 예상 시간

**총 예상 시간**: 1-2시간 (단순 wrapper 구현)

- Phase 1 (의존성 및 SDK 초기화): 15분
- Phase 2 (API Routes 생성): 30분
- Phase 3 (Frontend 통합): 15분
- Phase 4 (환경 설정): 5분
- 테스트 및 검증: 30분

---

## 다음 단계 (후속 작업)

완료 후 우선순위:

1. ✅ **SPEC-DEMO-001 완료** (이번 작업)
2. 🟡 Docker Compose 로컬 환경 검증
3. 🟢 Polygon Amoy Testnet 배포
4. 🟢 OZ Defender Relay 설정
5. ⚪ 프로덕션 배포 준비 (별도 SPEC 필요)
