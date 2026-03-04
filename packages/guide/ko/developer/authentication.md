# 인증

SoloPay API는 엔드포인트 종류에 따라 두 가지 인증 방식을 사용합니다.

## 인증 방식 개요

| 방식       | 헤더           | 사용 엔드포인트                                             |
| ---------- | -------------- | ----------------------------------------------------------- |
| Public Key | `x-public-key` | POST /payments, GET /payments/:id, POST /payments/:id/relay |
| API Key    | `x-api-key`    | GET /merchant/\*, POST /refunds, GET /refunds               |
| 인증 없음  | 없음           | GET /chains, GET /chains/tokens                             |

## API Key와 Public Key 발급

관리자로부터 두 가지 키를 발급받습니다.

| 종류       | 접두사                  | 용도                        |
| ---------- | ----------------------- | --------------------------- |
| API Key    | `sk_...`                | 가맹점 정보, 환불 등 관리용 |
| Public Key | `pk_live_` / `pk_test_` | 결제 생성, 상태 조회        |

::: warning 보안 주의

- **API Key**: 서버 사이드에서만 사용. 절대 클라이언트에 노출 금지.
- **Public Key**: 브라우저에서 사용 가능하지만 `Origin` 헤더로 도메인 제한을 함께 설정할 것을 권장합니다.
  :::

## API Key 사용 예시

API Key는 가맹점 정보 조회, Webhook 검증, 결제 내역 조회 등 서버 사이드 관리 작업에 사용합니다.

```bash
curl https://pay-api.staging.sut.com/api/v1/merchant \
  -H "x-api-key: sk_xxxxx"
```

## 환경 변수 설정

```bash
SOLO_PAY_API_KEY=sk_xxxxx
SOLO_PAY_PUBLIC_KEY=pk_test_xxxxx
```

## Origin 검증

서버에 `ALLOWED_WIDGET_ORIGIN` 환경 변수가 설정된 경우, `Origin` 헤더를 검증합니다.
브라우저에서 호출 시 `Origin`은 자동으로 설정됩니다.

```bash
# 서버 측 환경 변수 예시
ALLOWED_WIDGET_ORIGIN=https://yourshop.com
```

## 보안 권장사항

**해야 할 것**

- API Key를 환경 변수로 관리
- 서버 사이드에서만 API Key 사용
- 가능하면 Origin 도메인 제한 설정

**하지 말아야 할 것**

- 클라이언트 코드에 API Key 노출
- 버전 관리 시스템에 키 커밋
- 로그에 키 출력

::: danger 금지
API Key(`sk_`)를 프론트엔드에 절대 포함하지 마세요. Public Key(`pk_`)만 클라이언트 측에 사용하세요.
:::

## 다음 단계

- [결제 생성](/ko/payments/create) - 첫 결제 만들기
