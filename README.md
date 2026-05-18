# PMF Signal Radar

> **CS 고객문의 inbox 를 PMF 신호 레이더로 전환** — Cloudflare Workers + Supabase + LLM 으로 4채널 (email, Channel Talk, Kakao, 오픈채팅) 인입을 받아 Push / Anxiety / Workaround / Buying Trigger 로 구조화하는 운영자 시스템.

이 repo 는 [hplan](https://github.com/kimsanguine/hplan) 방법론을 production 코드에 적용한 케이스 스터디입니다. 자세한 배경은 [CASE_STUDY.md](./CASE_STUDY.md).

## 한 줄 콘셉트

"AI 가 답변을 잘한다" 가 아니라, **흩어진 고객 불편이 PMF 증거 → 기회 → 실험 → 제품 개선안으로 바뀌는 과정** 을 코드로 구현한다.

## 아키텍처

```
[4 채널]                 [Cloudflare Workers]              [Supabase]
                              │
 email (SES)        ──→  email-inbound  ─┐
 Channel Talk       ──→  channel-talk    ├──→  webhook_inbox ──→ signal_inbox
 Kakao Consultalk   ──→  (P2.4 예정)     │         │                  │
 오픈채팅 수동       ──→  data-ingest    ─┘         ▼                  ▼
                                              auto-reply ──→ Telegram
                                                              운영자 통지
```

- **`workers/email-inbound`** — AWS SES → SNS HTTPS → Worker → Supabase (SNS Signature v1 검증)
- **`workers/channel-talk`** — URL query token 검증 → Worker → Supabase
- **`workers/auto-reply`** — Tiered Auto-Reply 5조건 AND 룰 + Telegram 통지
- **`workers/_shared`** — PII 마스킹 / idempotency / product_scope 분류 (재사용 모듈)
- **`supabase/migrations`** — 6 테이블 + 12 RLS policy + view + trigger + pg_cron

## 라이브 데모

🚀 **https://pmf-radar.pages.dev/** (Cloudflare Pages)

> 정적 UI 데모입니다. **LLM 분류 기능** (`/api/classify`) 은 로컬에서 `server.py` 실행 시 작동 — 빠른 시작 섹션 참조.

## 빠른 시작 — 로컬 데모 (5분)

### 사전 요구사항
- Python 3.13+
- Node 20+ (Workers 빌드용)
- Supabase 프로젝트 (또는 fixture 모드)
- OpenAI API key

### 1. Clone + 환경 설정
```bash
git clone https://github.com/kimsanguine/pmf_radar.git
cd pmf_radar
cp .env.example .env
# .env 의 값들을 실제 값으로 채우기
```

### 2. P1 데모 (서버 + 브라우저)
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt  # 또는 pip install fastapi uvicorn requests openai
python3 server.py
```

브라우저에서 `http://127.0.0.1:8892/demo/index.html` 을 열면:

1. **Input** — Channel Talk / Kakao / CSV / JSON / 수동 붙여넣기
2. **Normalize** — adapter schema 형태로 정규화
3. **Mask** — 이메일·전화번호·주문번호 기본 마스킹
4. **Classify** — Intent / Anxiety / Workaround / Buying Trigger 추출
5. **Reply/HITL** — FAQ 답변 초안 + 운영자 검토 대기
6. **Backlog** — Radar 시각화 + Markdown export

### 3. Workers 로컬 개발 (선택)
```bash
cd workers/email-inbound
npm install
npm run dev          # wrangler dev — localhost:8787
npm test             # vitest
```

각 Worker 디렉토리에 `wrangler.toml`, `vitest.config.ts` 포함.

## 배포

### Cloudflare Workers
```bash
cd workers/email-inbound
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put SNS_TOPIC_ARN
wrangler deploy
```

각 Worker (`channel-talk`, `auto-reply`) 도 동일한 패턴.

### Supabase 마이그레이션
```bash
supabase link --project-ref <your-project>
supabase db push
```

마이그레이션은 `supabase/migrations/` 의 3개 파일:
- `20260518000001_p2_inbox_schema.sql` — 6 테이블
- `20260518000002_p2_rls_policies.sql` — 12 RLS policy
- `20260518000003_p2_views_triggers.sql` — view + trigger + pg_cron

## Remotion 시연 영상

```bash
cd remotion
npm install
npm run render     # demo/assets/hplan-pmf-demo.mp4
npm run still      # demo/assets/hplan-pmf-demo-poster.png
```

## 테스트

```bash
# Python
pytest tests/ -v                                       # 17 test
python3 scripts/validate_schemas.py --report           # 27 check

# TypeScript Workers
cd workers/email-inbound && npm test                   # vitest
cd workers/channel-talk  && npm test
cd workers/auto-reply    && npm test
```

전수 통과 기준: **92 test PASS** (Python 40 + TS 49 + retention 3).

## 디렉토리 구조

```text
pmf_radar/
├── workers/                 # Cloudflare Workers 4개
│   ├── _shared/             # PII 마스킹·idempotency·product_scope
│   ├── email-inbound/       # SES → SNS → Worker
│   ├── channel-talk/        # URL token 검증
│   └── auto-reply/          # Tiered Auto-Reply
├── supabase/migrations/     # DB 스키마 3개
├── server.py                # P1 데모 백엔드 (/api/classify)
├── scripts/                 # 운영 스크립트 (Telegram, retention, validate)
├── tests/                   # Python 테스트
├── data/                    # signal_schema + fixtures + sample_inquiries
├── demo/                    # PMF Signal Radar UI (108KB index.html)
├── remotion/                # 시연 영상 컴포넌트
├── docs/                    # PRD, P2_DESIGN, SPEC (재현 단서)
├── wrangler.toml            # 메인 Worker 라우팅
├── CASE_STUDY.md            # hplan 적용 배경 + 의사결정
└── LICENSE                  # MIT
```

## 더 읽을 거리

- **[CASE_STUDY.md](./CASE_STUDY.md)** — 어떻게 만들었는가 (hplan 방법론 적용 흐름)
- **[docs/PRD.md](./docs/PRD.md)** — P1 강의 데모 PRD
- **[docs/PRD-P2.md](./docs/PRD-P2.md)** — P2 운영자 라이브 PRD
- **[docs/P2_DESIGN.md](./docs/P2_DESIGN.md)** — 4채널 통합 + Tiered Auto-Reply 설계
- **[docs/SPEC.md](./docs/SPEC.md)** — 스키마 + 인터페이스 명세

## License

[MIT](./LICENSE) © 2026 Sanguine Kim
