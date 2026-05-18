# PRD-P2: Multi-Channel Live Inbox + Validation Harness

Status: Draft v0.1 (input = `docs/P2_DESIGN.md` v0.2)
Owner: 1인 운영자 (kimsanguine, habix.ai)
Last updated: 2026-05-17
Supersedes: 없음. P1 PRD(`docs/PRD.md`)는 강의/실습 카논으로 유지.

## 1. Summary

P1 에서 완성한 mock 기반 PMF Radar Lab 을 운영자 본인의 4채널(이메일·카카오톡 상담·카카오 오픈채팅·Channel Talk) 인입에 연결하고, 정합성 검증을 Ralph verify 훅으로 강제한다. 자동 답변은 절대 보내지 않는다. 강의 자료에는 P2 결과를 노출하지 않는다.

## 2. Problem

P1 의 mock evidence 는 강의·리허설에는 충분하지만 다음을 풀지 못한다.

- 운영자 본인 inbox 의 messy customer voice 가 PMF Radar 로 흐르지 않아 자기 운영에 사용 불가.
- B2B PM 영업에서 "라이브 인입 → 분류" 데모 영상이 결제 트리거인지 *가설*만 있고 evidence 가 0건.
- 정합성 부채(어제 audit 에서 3건 Critical 발견)가 매 변경마다 재발 — 자동 게이트 없음.
- 1인 운영자가 24시간 inbox 노출되면 burnout 위험.
- raw 고객 데이터가 메모리/디스크에 영속화되면 PIPA 책임이 개인에게 누적.

## 3. Target User

**Primary**: 1인 운영자(사용자 본인). habix.ai 도메인 메일·카카오톡·오픈채팅방 운영 중.

**Secondary (가설, evidence 0건)**:
- B2B 사내교육 담당자(HRD) — 결제 권한자.
- B2B 현업 PM — 라이브 데모에 흥미를 보이는 영향자.

Out of Primary: 강의 수강생(P1 카논으로 유지).

## 4. Desired Outcome

1주 운영 후 다음 상태에 도달한다.

- 운영자의 4채널 인입이 단일 `webhook_inbox` 테이블로 통합되어 PMF Radar 에 표시된다.
- HITL 항목은 Telegram 포인터 알림으로 도착하고, 본문에는 PII 가 없다.
- 오프타임(22:00–08:00 KST) 알림은 batch.
- raw payload 는 30일 후 자동 삭제. masked 만 영속.
- Ralph verify 가 25-check validation 을 자동 실행하고 fail 시 차단.
- product_scope (`habix_course` / `pmf_radar_lab` / `other`) 로 분류된 evidence 가 hplan Lab 분석에 사용된다.

## 5. MVP Must-Haves

| 단계 | 항목 |
|------|------|
| P2.1 | signature 검증 (HMAC-SHA256, `hmac.compare_digest`) |
| P2.1 | payload size guard (≤1MB, 401/413) |
| P2.1 | `GET /api/webhooks/inbox` Bearer 인증 |
| P2.1 | webhook 응답 200 즉시 + 분류 후처리 분리 |
| P2.1 | `mask_pii` 이름·회사명·주문번호 정규식 추가 |
| P2.2 | 이메일 인입 Worker — **AWS SES inbound → SNS HTTPS → Cloudflare Worker** (habix.ai MX 이미 SES Tokyo 로 라우팅됨, ground truth 2026-05-18) |
| P2.2 | Cloudflare Workers + Supabase production deploy |
| P2.2 | Supabase `webhook_inbox` / `webhook_idempotency` / `raw_payload_retention` 테이블 |
| P2.2 | Telegram 포인터 알림 + 오프타임 가드 |
| P2.2 | Channel Talk Workers receiver (production 1차) |
| P2.2 | 오픈채팅 manual paste UI |
| P2.2 | **Auto-Reply 룰 엔진** — 5조건 AND 검증, 이메일 채널만 활성 |
| P2.2 | **사전 승인 답변 템플릿 DB** (`data/auto_reply_templates.json`) — category × locale 키 |
| P2.2 | **30초 dwell timer + Telegram 취소 버튼** — 자동발송 사고 차단 |
| P2.2 | **Supabase `auto_reply_log`** 테이블 (7일 보존, audit) |
| P2.2 | **일일 자동발송 상한 20건** — 초과 시 자동 중단 + HITL fallback |
| P2.3 | `data/webhook_payload_schema.json` |
| P2.3 | `scripts/validate_schemas.py` 25 check |
| P2.3 | 문서 lint matrix (README 카운트 grep, stale 표현 flag) |
| P2.3 | Ralph verify 훅 편입 |
| P2.3 | `scripts/retention_cleanup.py` cron |
| P2.4 | Sinch Conversation API 또는 카카오 상담 파트너 권한 비용·절차 정리 문서 |
| P2.4 | 결제 가능성 판단 + 별도 PRD 분기 결정 |

## 6. Non-Goals

- **LLM 생성 답변 자동 발송** (사전 승인 템플릿 100% 매치만 자동, 변형 X)
- **이메일 외 채널 자동 발송** (카카오/CT/오픈채팅은 P2 범위에서 항상 HITL — 채널 확장은 P3 게이트)
- 강의 자료(README/HANDOUT/TRIAL_PACK)에 P2 운영 결과 노출
- **오픈채팅 자동 크롤링/스크래핑** (정책상 금지)
- **raw payload 영속 저장** (masked 만 저장)
- 90분 본편 강의 콘텐츠 변경
- B2B 익명화 데이터팩 (D-B2B 별도 트랙)
- 다국어 응대
- pre-commit hook 강제 (Ralph verify 단일 게이트)
- Mermaid 자동 생성

## 7. Core User Stories

**P2.1 — Receiver Hardening**
1. 운영자로서, signature 가 검증되지 않은 webhook 이 OpenAI 비용을 폭증시키지 않게 한다.
2. 운영자로서, `Content-Length` 조작 공격(>1MB)으로 서버가 죽지 않게 한다.
3. 운영자로서, `GET /api/webhooks/inbox` 가 인증 없이 마스킹 CS 를 노출하지 않게 한다.
4. 운영자로서, OpenAI 호출 지연이 webhook 응답을 늦춰 재전송 폭풍이 일어나지 않게 한다.
5. 운영자로서, mask_pii 가 이름·회사명·주문번호도 가리게 한다.

**P2.2 — Production Multi-Channel**
6. 운영자로서, 내 운영 이메일로 들어오는 고객 메시지가 자동으로 PMF Radar 에 흐른다.
7. 운영자로서, 서버 재시작 후에도 idempotency 가 유지된다 (Supabase 영속).
8. 운영자로서, HITL 알림은 Telegram 으로 *포인터만* 도착한다 (PII/본문 X).
9. 운영자로서, 오프타임에는 알림이 무음이고 다음 on-hour 에 batch 로 받는다.
10. 운영자로서, 알림 클릭 시 Bearer 인증 대시보드에서만 내용을 확인한다.
11. 운영자로서, 오픈채팅 메시지를 manual paste UI 로 흘릴 수 있다 (자동 수집은 정책상 금지).
12. 운영자로서, Channel Talk webhook 이 production 으로 수신되어 1건 round-trip 한다.

**P2.3 — Validation Harness**
13. 운영자로서, Ralph verify 가 25-check validate_schemas 를 자동 실행한다.
14. 운영자로서, fail 시 verify 가 차단되어 부채가 머지되지 않는다.
15. 운영자로서, README 카운트(문의 50, 리허설 10) 가 다른 문서와 mismatch 면 lint 가 잡는다.
16. 운영자로서, "예정/TODO/미완" stale 표현이 production 문서에 남으면 flag 된다.
17. 운영자로서, raw_payload_retention 의 모든 row 가 30일 이하인지 자동 검증된다.
18. 운영자로서, Telegram 알림 본문 PII grep 0건이 강제된다.

**P2.2 — Auto-Reply (Tiered, email only)**
21. 운영자로서, 단순 ack 카테고리(setup·basic_faq·community·praise)는 5조건 통과 시 *이메일에서만* 자동 발송된다.
22. 운영자로서, 자동 발송 30초 전에 Telegram 으로 취소 알림을 받고 버튼 한 번으로 취소할 수 있다.
23. 운영자로서, 자동 발송은 사전 승인 템플릿 DB hit 만 허용되고 LLM 생성 답변은 절대 자동 발송되지 않는다.
24. 운영자로서, 일일 자동 발송이 20건을 초과하면 자동 중단되고 모든 요청이 HITL 로 fallback 된다.

**P2.4 — 카카오톡 상담 트랙 (Phase 4)**
19. 운영자로서, 카카오톡 상담 webhook 의 파트너 권한·Sinch 우회·예상 비용을 결제 가능 수준으로 정리한다.
20. 운영자로서, P2.3 통과 + 1주 운영 데이터 본 후 P2.4 진입을 결정한다.

## 8. System Workflow (mermaid)

`docs/P2_DESIGN.md` §7 그대로. 4채널 인입 → payload guard → signature → idempotency → 200 즉시 + 후처리 → mask + product_scope → /api/classify → Supabase → HITL on/off-hours 분기 → Telegram 포인터 → 운영자 대시보드. Retention cron 별도.

## 9. User Flow (mermaid)

`docs/P2_DESIGN.md` §8 그대로. 운영자(on/off-hours) / 수강생(P1 mock 만) / B2B PM(영업 가설). 강의 자료에 P2 결과 노출 X 명시.

## 10. Diagram Consistency Matrix

`docs/P2_DESIGN.md` §9 그대로. 14개 요구사항 ↔ workflow/userflow 매핑. B2B 트랙 Phase 4 후속 표시.

## 11. Functional Requirements (story 별 acceptance)

| Story | Spec | Acceptance |
|-------|------|-----------|
| US-1 | `verify_signature(secret, raw_body, header_sig)` 함수, HMAC-SHA256, `hmac.compare_digest` | invalid 시 401, body 파싱 진입 X. unit test: 정상/위조/누락 3 case |
| US-2 | `do_POST` 첫 줄 `if length > 1_048_576: return 413` | 1MB+1 byte payload → 413 즉시. unit test |
| US-3 | `GET /api/webhooks/inbox` → `Authorization: Bearer ${INBOX_READ_TOKEN}` | token 누락 → 401. unit test |
| US-4 | webhook handler: 200 즉시 반환 후 분류 비동기 (Workers `event.waitUntil` 또는 Supabase queue 트리거) | latency p95 < 1초. 통합 test |
| US-5 | `mask_pii` 정규식 — 이름(한글 2-4자 + 직책 조사), 회사명, 주문번호 패턴 | 50 fixture + 신규 10 PII fixture → unit test 정밀도 ≥ 0.9 |
| US-6 | `workers/email-inbound/` Worker — SES inbound rule → SNS HTTPS subscription → Worker fetch, SNS Message Signature 검증 | 운영자 메일 1건 → webhook_inbox row 1건 → Telegram 알림. 통합 test (SES sandbox + SNS sandbox) |
| US-7 | Supabase `webhook_idempotency` 테이블 (`source:message_id` PK) | server 재시작 후 같은 message 재수신 → 200 dedup. 통합 test |
| US-8 | `scripts/notify_operator.py` 알림 템플릿 강제 — `[PMF Signal] {category} / {strength}\nID: {id} 채널: {channel}\n대시보드: {url}?id={id}` | grep PII patterns → 0건. unit test |
| US-9 | `scripts/notify_operator.py` 오프타임 가드 — `22:00 ≤ KST < 08:00` 이면 skip + batch queue | batch flush cron — 08:00 KST 1회. 통합 test |
| US-10 | 운영자 대시보드 URL — Bearer 인증 미들웨어 | token 누락 시 401, 토큰 있을 때 200 |
| US-11 | `demo/index.html` 안 manual paste textarea + `source: kakao_openchat_manual` | paste → normalize → webhook_inbox. UI test (Playwright) |
| US-12 | `workers/channel-talk/` Worker — **URL query token 검증** (`?token=<CHANNEL_TALK_WEBHOOK_TOKEN>`, env 비교 + `crypto.subtle.timingSafeEqual` 스타일 constant-time). HMAC 아님 (B1 closed 2026-05-18). | invalid/missing token → 401. 통합 test (sandbox webhook 1건 round-trip + 도착 헤더 dump assertion) |
| US-13 | `scripts/validate_schemas.py --report` → `hplan/ralph_verify_report.md` validation 섹션 자동 추가 | run → file diff 확인 |
| US-14 | Ralph verify 실행 → validate_schemas fail 시 exit 1 + verify_report PASS 게이트 차단 | E2E test |
| US-15 | lint check 21: README 카운트 grep | README 카운트 변조 시 lint fail. unit test |
| US-16 | lint check 22: stale grep | "예정/TODO/미완" 문구 발견 시 flag |
| US-17 | check 25: retention SQL — `SELECT count(*) FROM raw_payload_retention WHERE created_at < now() - interval '30 days'` = 0 | 31일 row 삽입 → check fail; cron 후 PASS |
| US-18 | Telegram 알림 본문 PII grep — `mask_pii` 입력 후 출력 비교 | fixture 100건 → PII 패턴 검출 시 fail |
| US-19 | `docs/P2.4_KAKAO_EVAL.md` 신설 — Sinch 비용·파트너 권한 절차·예상 ROI | 문서 acceptance: 비용 표 + go/no-go 결정 기준 명시 |
| US-20 | P2.4 entry checklist — P2.3 통과 + 1주 운영 데이터 (volume 추정 + 강한 evidence 비율) | checklist 통과 시 PRD-P2.4 분기 |
| US-21 | Auto-Reply 엔진 — 5조건 평가 함수 `evaluate_auto_reply_eligibility(record) -> bool` | 5조건 unit test 각 1건 + 1조건 fail 시 false 5건 = 10 test PASS |
| US-22 | dwell timer — auto-reply queue 에 30초 대기 후 발송, Telegram 취소 버튼 = 큐 row 삭제 | integration test: 30초 내 취소 → 미발송, 30초 후 → 발송 1건 |
| US-23 | template DB hit — 답변 텍스트가 `auto_reply_templates.json` 의 어떤 entry 와도 exact match 아니면 reject | unit test: 변형 텍스트 reject, exact match accept |
| US-24 | daily cap 20 — `auto_reply_log` count(today) >= 20 이면 신규 요청 자동 HITL fallback | integration test: 21번째 요청 → HITL queue 진입 + 운영자 알림 |

## 12. Non-Functional Requirements

**보안**
- 모든 webhook secret/token 은 `.env` 또는 Workers 환경변수에만 존재. 로그 출력 금지.
- HMAC compare 는 `hmac.compare_digest` (timing attack 방지).
- raw payload 는 30일 후 자동 삭제 (PIPA).
- Telegram 알림 본문 PII grep 0건 강제 (US-18).
- Workers production URL 은 habix.ai 서브도메인. Cloudflare WAF 기본 + rate limit 60 req/min per IP.

**운영**
- 1인 운영자 알림 채널 = Telegram 단일.
- 오프타임 22:00–08:00 KST 무음.
- 운영자 burnout 모니터링 — Phase 3 통과 조건에 "24시간 무중단 1주 운영" 명시.

**성능**
- webhook 응답 p95 latency < 1초 (200 즉시 반환).
- 분류 후처리는 별도 queue 또는 `event.waitUntil`.
- OpenAI 호출 실패 시 raw masked 만 webhook_inbox 에 저장 + 사람 재시도.

**관찰성**
- validate_schemas 결과는 `hplan/ralph_verify_report.md` 에 자동 inclusion.
- Telegram 알림 round-trip 1회/일 health check.

## 13. Acceptance Criteria (Phase 별 통과 조건)

**Phase 2 (변경) 통과**
- [ ] P1 의 15 check + 신규 unit test (US-1, 2, 3, 5) PASS
- [ ] webhook 응답 latency p95 < 1초
- [ ] `/api/webhooks/inbox` Bearer 검증 401 test
- [ ] mask_pii 신규 패턴 unit test 정밀도 ≥ 0.9

**Phase 3 (신규) 통과**
- [ ] webhook_payload_schema.json + 25 check PASS
- [ ] Workers production deploy — Email 1건 round-trip 성공
- [ ] Supabase idempotency 재시작 후 dedup 유지 (US-7)
- [ ] Telegram 알림 round-trip + PII grep 0건 (US-8, US-18)
- [ ] retention cron 동작 (US-17)
- [ ] ralph_verify_report.md validation 섹션 자동 생성 (US-13)
- [ ] **Auto-Reply 게이트**: 100% 사전 승인 템플릿 hit, LLM 생성 발송 0건, 일일 ≤20건, 모든 발송에 audit row (US-21~24)
- [ ] **운영자 24시간 무중단 1주 운영** (volume 가설 검증)

**Phase 4 (P2.4) 진입 게이트**
- [ ] Phase 3 통과 후 1주 운영 데이터 분석
- [ ] `docs/P2.4_KAKAO_EVAL.md` 완성 (US-19)
- [ ] 결제 가능 비용·ROI 명시 후 사용자 결정

## 14. Test Plan

| 레벨 | 도구 | 범위 |
|------|------|------|
| Unit | pytest | mask_pii 패턴 / signature verify / payload guard / Bearer auth / notify_operator 템플릿 grep / 오프타임 가드 |
| Schema | scripts/validate_schemas.py 25 check | 매 commit + Ralph verify |
| Integration | pytest + Workers local (`wrangler dev`) | webhook → Workers → Supabase → notify_operator round-trip |
| E2E (Playwright) | demo/index.html manual paste UI / 대시보드 Bearer auth flow |
| Manual | 운영자 1주 운영 | volume 가설 검증 + burnout 모니터링 |

## 15. Rollout Plan (Phase 표)

| Phase | 기간 추정 | 산출물 | Gate |
|-------|-----------|--------|------|
| P2.1 (Phase 2) | 1주 | server.py 보강 + unit test 12개 | latency p95 < 1초, 401/413 검증 |
| P2.2 (Phase 3 - 인입/인프라) | 2주 | Workers + Supabase + 이메일 1차 + CT 1차 + manual paste | Email round-trip 성공 + Telegram 1회 |
| P2.3 (Phase 3 - 검증) | 1주 | validate_schemas 25 check + 문서 lint + Ralph 훅 | 25 check PASS + verify auto-section |
| 운영 1주 | 1주 | volume 추정 + burnout 점검 | 24시간 무중단 + 강한 evidence 비율 |
| P2.4 평가 | 1주 | docs/P2.4_KAKAO_EVAL.md | go/no-go 사용자 결정 |

총 ~6주.

## 16. Risks

**기술 (α critique)**
- R1: **현실화 2026-05-18** — Channel Talk 은 HMAC 이 아니라 URL token (B1 closed). PRD/Design surgical 정정 완료. 잔여 위험: token URL 노출(HTTPS 만 보호) → *완화*: Cloudflare WAF IP allowlist 옵션 검토(Channel Talk egress IP 공개 시), 토큰 로그 출력 금지, α Round 2 sandbox 실측 게이트. SNS Message Signature (이메일 트랙) 은 별개·HMAC 유지.
- R2: Workers Service Binding same-zone 521 (메모리 `feedback_cf_worker_same_zone`). *완화*: Supabase HTTP API 직접 호출 경로로 우회.
- R3: OpenAI cold start 또는 quota fail → 분류 결손. *완화*: raw masked 만 webhook_inbox 에 저장 + 사람 재시도.

**운영·PM (β critique)**
- R4: 운영자 burnout — 24시간 inbox 노출. *완화*: 오프타임 batch + Phase 3 통과 조건 "1주 무중단 검증" 후 확장.
- R5: evidence 오염 — habix-course inbox 가 Lab PMF 가설 측정으로 오용. *완화*: product_scope 분리 + 검증 #20.
- R6: PIPA 위반 — raw 영속화 시 1인 책임. *완화*: 30일 자동 삭제 cron + 검증 #25.
- R7: hplan evidence_gate 점프 — P2 가 리허설/인터뷰를 우회. *완화*: P2.4 진입 게이트에 evidence_gate 5명 인터뷰 별도 트랙 명시.

**시장 (β critique C-3)**
- R8: B2B 영업 가설 — "라이브 데모 = 결제 트리거" evidence 0. *완화*: P2.4 평가 시 인터뷰 3건 별도 트랙으로 검증.
- R9: **Auto-Reply 템플릿 stale** — 사전 승인 템플릿이 시간이 지나 부정확해지면 잘못된 답변이 자동 발송. *완화*: (a) template DB 마지막 검토일 필드 + 30일 초과 시 lint flag, (b) 일일 cap 20건 + audit log review 매일 5분, (c) 운영자 취소 통계가 임계치 초과하면 자동 발송 일시 중단.

## 17. Dependencies

- Cloudflare Workers 계정 (habix.ai 기존 사용).
- ✅ Supabase project — **`ypbsgiqyeztzdhtaedfi.supabase.co` 신규 신설 (P2 전용)** (사용자 결정 2026-05-18, habix project 와 분리). 격리 효과: ε R2 의 R5 evidence 오염 위험 자동 회피 (habix-course inbox 와 PMF Radar Lab inbox 가 다른 project 에 격리).
- OpenAI API key (P1 에서 사용 중).
- ✅ Telegram **chat_id `8595911950` 재사용** (OpenClaw cron 운영 중). ⏸ P2 전용 봇 토큰만 신규 발급. env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_OPERATOR_CHAT_ID`.
- 운영자 이메일 인프라 — **habix.ai 도메인 + AWS SES inbound (ap-northeast-1 Tokyo) 이미 운영 중** (DNS MX 조회 2026-05-18 ground truth). SES inbound rule + SNS topic 신설만 필요.
- Channel Talk 계정 (운영자 미사용 — sandbox 만). 인증은 URL token (B1 closed), env `CHANNEL_TALK_WEBHOOK_TOKEN`.

## 18. hplan Gate Status

**Evidence Gate**: `CONDITIONAL_GO` 미닫힘. 본 PRD 는 evidence 채널을 *늘리지만 게이트를 닫지 않음*. 별도 트랙으로 5명 인터뷰 (B2B PM 3 + 강의 수강생 2) 진행 권고.

**Product Gate**: `product_gate_draft.md:91-93` *부분 override*. 사유 = (1) 운영자 자기 사용 (유효) + (2) B2B 영업 가설 검증 (evidence 0). 강의 자료 격리 유지.

**Build Gate**: 본 PRD 가 build 결정. Phase 2/3/4 통과 조건이 build → evidence 환류 강제 (1주 운영 데이터 = evidence 확장).

**Improvement Gate**: validate_schemas 25 check 가 *문서 정합성* 검증. PMF 학습 정합성(P2 데이터가 Lab 가설을 강화/약화) 은 P2.4 평가 단계에서 별도 검증.

## 19. Open Questions

- ~~B1.~~ **CLOSED 2026-05-18**: Channel Talk webhook 은 HMAC 서명이 아니라 **URL query token** 방식 (`POST /path?token=<CHANNEL_TALK_WEBHOOK_TOKEN>`). 공식 docs 4개·GitHub repo 조사로 ε 가 확정. PRD-P2 §11 US-12 / P2_DESIGN §7 S2 의 HMAC-SHA256 가정 *틀림* — surgical 정정 완료. α Round 2 sandbox 실측이 최종 ground truth (test webhook 1건 도착 헤더 dump).
- ~~B2.~~ **CLOSED 2026-05-18**: AWS SES inbound (ap-northeast-1). DNS ground truth 조회로 확정. P2.2 sprint 에서 SES inbound rule + SNS topic 신설 + Worker subscription 만 추가.
- ~~B3.~~ **CLOSED 2026-05-18**: 옵션 A — `service_role` permissive ALL + `anon` restrictive DENY. β 마이그레이션 (5 table) 일관 적용. RLS silent fail (anon PATCH 200 + empty body) 함정 회피 — Workers 코드는 응답 배열 length 0 체크 패턴.
- ~~B4.~~ **CLOSED 2026-05-18**: 운영자 chat_id `8595911950` (`project_daily_briefing_agent` 메모리 — OpenClaw cron 이 이미 운영 중). env 변수명 표준 = `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OPERATOR_CHAT_ID`. 봇 토큰만 신규 발급 필요 (P2 전용 봇 권장).
- B5. 일일 webhook 볼륨 추정 — 운영 1주 후 실측.

## 20. Launch Criteria

P2.1 (Phase 2):
- [ ] unit test 12개 PASS
- [ ] latency p95 < 1초 검증
- [ ] 401/413 검증

P2.2 (Phase 3 - 인입):
- [ ] Workers + Supabase production deploy
- [ ] Email 1건 round-trip
- [ ] Channel Talk sandbox 1건 round-trip
- [ ] 오픈채팅 manual paste UI 동작
- [ ] Telegram 알림 + PII grep 0건

P2.3 (Phase 3 - 검증):
- [ ] validate_schemas 25 check PASS
- [ ] 문서 lint matrix 동작
- [ ] Ralph verify 자동 inclusion
- [ ] retention cron 동작

운영 1주:
- [ ] 24시간 무중단
- [ ] 일일 volume 측정
- [ ] burnout 자가 점검

P2.4 진입:
- [ ] docs/P2.4_KAKAO_EVAL.md 완성
- [ ] go/no-go 사용자 결정
