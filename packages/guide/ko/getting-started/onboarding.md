# 가맹점 온보딩 플로우

SoloPay를 통해 첫 결제를 연동하기 전, 가맹점으로서 필요한 필수 데이터 셋업 절차(온보딩)를 안내합니다.

## 시스템 관리자로부터 발급받기

가장 먼저 시스템 관리자를 통해 다음 정보를 전달받아야 합니다:

1. `merchantId` (가맹점 고유 식별자)
2. `API Key` (`sk_` 형태, 가맹점 전용 API 접근 권한)
3. `Public Key` (`pk_` 형태, 결제 생성 등 클라이언트 접근 권한)

## 전체 준비 흐름

가맹점을 활성화하고, 사용할 **ERC-20 결제 토큰**의 종류를 내 상점에 등록해야 결제 생성이 가능합니다. 아래 일련의 과정을 따라야 합니다.

### 1. 가맹점 설정 확인

관리용 API Key를 사용하여 내 가맹점 정보가 올바르게 생성되었는지 확인합니다.
(수령 지갑 주소 `treasuryAddress`가 올바른지 등)

```bash
curl https://pay-api.staging.msq.com/api/v1/merchant \
  -H "x-api-key: sk_test_xxxxx"
```

### 2. 가맹점 결제 수단 추가

사용자가 결제할 때 지불할 ERC-20 토큰의 컨트랙트 주소를 결제 수단에 매핑해야 합니다. (이때 사용등록 가능한 토큰은 전체 시스템에서 화이트리스트 처리된 토큰이어야 함)

```bash
# 결제수단 추가
curl -X POST https://pay-api.staging.msq.com/api/v1/merchant/payment-methods \
  -H "x-api-key: sk_test_xxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "tokenAddress": "0xE4C687167705Abf55d709395f92e254bdF5825a2",
    "is_enabled": true
  }'
```

### 3. 활성화 상태 점검

토큰의 `is_enabled` 상태가 `true`인지 확인하세요. 이 값이 `false`이거나 토큰이 추가되지 않은 경우 결제 생성(`POST /payments`) 단계에서 `TOKEN_NOT_ENABLED` 에러가 발생합니다.

### 4. 연동 및 테스트

토큰 셋업이 완료되면 문서의 [결제 생성](/ko/payments/create) 파트를 참고하여 결제 시스템 개발을 시작할 수 있습니다.
