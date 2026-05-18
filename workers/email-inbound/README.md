# T1 Email Inbound Worker

AWS SES 이메일 인입 → SNS HTTPS → Cloudflare Worker 처리 파이프라인.

## 아키텍처

```
고객 이메일 (habix.ai 도메인)
  → MX: inbound-smtp.ap-northeast-1.amazonaws.com (기존 운영 중)
  → AWS SES inbound rule (ap-northeast-1)
  → SNS Topic (HTTPS subscription)
  → Cloudflare Worker (이 Worker)
  → normalize + mask_pii
  → console.log [Round 1]
  → Supabase webhook_inbox [Round 2, β 스키마 후]
```

## 디렉토리 구조

```
workers/email-inbound/
├── src/
│   ├── index.ts        — Worker 진입점 (fetch handler)
│   ├── sns-verify.ts   — SNS Message Signature Version 1 검증
│   └── normalize.ts    — SES payload → NormalizedInquiry (mask_pii 포함)
├── tests/
│   └── sns-verify.test.ts — unit test 3건
├── wrangler.toml
├── package.json
├── tsconfig.json
└── README.md
```

## 로컬 개발

```bash
cd workers/email-inbound
npm install

# 타입 체크
npm run type-check

# 로컬 dev 서버 (wrangler dev)
npm run dev

# 테스트
npm test
```

## 환경 변수 설정

### wrangler.toml 에 명시 가능한 값 (비밀 아님)

```toml
[vars]
SNS_TOPIC_ARN = "arn:aws:sns:ap-northeast-1:ACCOUNT_ID:habix-ses-inbound"
SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
```

### Secrets (wrangler secret put 으로 설정 — 절대 코드/toml 에 하드코딩 금지)

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## AWS SES Inbound Rule 설정 절차

habix.ai MX 는 이미 `inbound-smtp.ap-northeast-1.amazonaws.com` 으로 설정됨 (ground truth 2026-05-18).
SES inbound rule 과 SNS topic 만 신설하면 됨.

### 1. SNS Topic 생성 (ap-northeast-1)

```bash
aws sns create-topic \
  --name habix-ses-inbound \
  --region ap-northeast-1
```

출력에서 TopicArn 복사 → wrangler.toml `SNS_TOPIC_ARN` 에 입력.

### 2. Cloudflare Worker 배포 (먼저)

```bash
npm run deploy
```

Workers 배포 후 URL 확인: `https://email-inbound.YOUR_SUBDOMAIN.workers.dev`
또는 Custom Domain 설정: `email-inbound.habix.ai`

### 3. SNS HTTPS Subscription 생성

```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:ap-northeast-1:ACCOUNT_ID:habix-ses-inbound \
  --protocol https \
  --notification-endpoint https://email-inbound.habix.ai/ \
  --region ap-northeast-1
```

Worker 가 `SubscriptionConfirmation` 수신 시 자동으로 `SubscribeURL` GET 처리.
AWS 콘솔에서 Subscription 상태가 `Confirmed` 로 바뀌는지 확인.

### 4. SES Inbound Rule 생성 (ap-northeast-1)

AWS 콘솔 또는 CLI:

```bash
aws ses create-receipt-rule \
  --rule-set-name habix-inbound \
  --rule '{
    "Name": "habix-ai-inbound",
    "Enabled": true,
    "TlsPolicy": "Require",
    "Recipients": ["cs@habix.ai"],
    "Actions": [
      {
        "SNSAction": {
          "TopicArn": "arn:aws:sns:ap-northeast-1:ACCOUNT_ID:habix-ses-inbound",
          "Encoding": "UTF-8"
        }
      }
    ],
    "ScanEnabled": true
  }' \
  --region ap-northeast-1
```

받을 이메일 주소(Recipients)에 실제 운영 주소로 교체.

### 5. SES Rule Set 활성화

```bash
aws ses set-active-receipt-rule-set \
  --rule-set-name habix-inbound \
  --region ap-northeast-1
```

## Round 1 → Round 2 전환

Round 1 (현재): normalize 결과를 `console.log` 만.

Round 2 (β 스키마 완성 후): `src/index.ts` 의 `supabaseInsert` 주석 해제.
필요한 β 산출물:
- Supabase `webhook_inbox` 테이블 DDL (columns: id, source, channel, segment, message, received_at, sender_id_hash, product_scope, signature_verified, created_at)
- Supabase `webhook_idempotency` 테이블 DDL (idempotency key: `source:message_id`)
- RLS 정책 (service_role 만 INSERT 허용)

## 보안 설계

| 위협 | 대응 |
|------|------|
| SSRF via SigningCertURL | `sns.*.amazonaws.com` 도메인만 허용 |
| Payload DoS | Content-Length + 실제 body 크기 ≤ 1MB 이중 가드 |
| 위조 SNS 메시지 | RSA-SHA1 + X.509 cert 검증 (verifySnsSignature) |
| PII 로그 유출 | mask_pii 적용 후 console.log (sender hash 앞 8자만 출력) |
| 잘못된 Topic | SNS_TOPIC_ARN 환경변수로 화이트리스트 검증 |
| same-zone Worker fetch 521 | Service Binding X, Supabase HTTP API 직접 호출 |

## 테스트

```bash
npm test
# 4건 PASS 기대:
# - TC-1: valid Notification JSON 파싱
# - TC-2: 필수 필드 누락 → null
# - TC-3: 도메인 불일치 SigningCertURL → throw
# - TC-4: SubscriptionConfirmation 파싱
```
