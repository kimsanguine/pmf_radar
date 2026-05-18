# How We Built PMF Signal Radar with hplan

> "AI agent 를 만든다" 와 "production 에서 실제로 돌아가는 AI agent 를 만든다" 사이의 거리를, hplan 게이트가 어떻게 좁히는지를 보여주는 케이스 스터디.

## 1. 이 repo 의 정체

`pmf_radar` 는 **CS 고객문의 inbox 를 PMF 신호 레이더로 전환**하는 운영자용 시스템입니다. 4채널 (email, Channel Talk, Kakao Consultalk, 오픈채팅) 인입을 받아, LLM 으로 신호를 추출하고, Supabase 에 적재한 뒤 운영자에게 Telegram 으로 통지합니다.

이 케이스 스터디는 그 시스템이 **어떤 의사결정 흐름을 거쳐** production 코드로 굳어졌는지에 집중합니다. 코드만 보면 안 보이는 부분 — 무엇을 만들기로 했고, **무엇을 만들지 않기로 했는지** — 가 핵심입니다.

## 2. 왜 hplan 인가

흔한 AI 프로젝트 실패 패턴:

```
아이디어 → 곧바로 코드 → 데모는 작동 → 운영 들어가니 무너짐
```

이유는 게이트가 없기 때문입니다. **"강한 증거 3개 모이기 전에는 코드를 짜지 않는다"** 같은 명시적 brake 가 없으면, vapor ware 가 양산됩니다.

hplan 은 그 brake 를 3단으로 강제합니다:

| 게이트 | 통과 조건 (요약) | 통과 못 하면 |
|---|---|---|
| **Evidence Gate** | 같은 pain 신호가 ≥3회 반복 + Push/Anxiety/Workaround 중 ≥2개 동반 | 코드 작성 금지, 인터뷰 추가 |
| **Product Gate** | Opportunity Solution Tree 에서 "만들 것 / 안 만들 것" 명시 구분 | 기능 무한 확장 |
| **Build Gate** | "다음 미팅 전까지 작동 데모 + round-trip 측정값" 약속 | release 금지 |

이 repo 의 코드는 **세 게이트를 모두 통과한 결과물**입니다.

## 3. 우리가 풀려던 문제

- **P1 (강의 데모)**: 학생들이 "AI 가 답변을 잘한다" 가 아니라 **"흩어진 불만이 PMF 증거로 바뀐다"** 를 체감하는 흐름
- **P2 (운영자 라이브)**: 1인 운영자가 4채널 inbound 를 한 곳에 모아 보고, 자동 응답 + HITL 분기로 처리하는 시스템

두 phase 가 같은 inbox 스키마를 공유하면서, 강의실에서 본 패턴이 실제 운영에서도 그대로 작동하는 것을 검증합니다.

## 4. hplan 이 어떻게 결과를 빚었는가

### 4.1 Evidence Gate — "강한 증거" 가 코드를 찾았다

50개의 sample 고객 문의를 분석할 때, 우리는 **세 종류의 증거 강도** 를 구분했습니다:

- **강한 증거**: 같은 패턴이 3회 이상 반복 + 다른 채널에서도 발견 + Workaround 동반
- **약한 증거**: 1회만 발생, 또는 Push 만 있고 Anxiety/Workaround 없음
- **잡음**: 단순 칭찬, 일반 질문

게이트를 통과한 강한 증거 예시:

> "카카오톡 단답 메시지로 절반 이상의 문의가 들어온다" — 47% 의 데이터에서 반복

이게 코드의 첫 라인을 결정했습니다: **`channel-talk` Worker 의 빈 텍스트 정책 처리** (`channel_adapter_schema.json::empty_text_policy`). 만약 강한 증거 없이 "유저는 풍부한 텍스트로 문의할 거야" 라고 가정했다면, 절반의 입력이 빈 문자열로 들어와 시스템이 죽었을 겁니다.

약한 증거였던 것:

> "고객은 음성 메시지로 문의한다" — 1회만 발생

이건 **명시적으로 backlog 로 demote**. 음성 → STT 파이프라인 같은 큰 작업을 미리 만들지 않았습니다.

### 4.2 Product Gate — "안 만들 것" 의 가치

Opportunity Solution Tree 를 그리면서, 우리는 의도적으로 **만들지 않을 기능 5개를 명시**했습니다:

| 안 만든 것 | 안 만든 이유 |
|---|---|
| 카카오톡 정교한 자동 응답 | Build Gate 의 "round-trip 측정" 약속과 충돌. 5조건 AND 룰 (Tiered Auto-Reply) 로 단순화 |
| 멀티 언어 지원 | 1인 운영자 한국어 단일 환경 → 강한 증거 0 |
| 음성 메시지 STT | 약한 증거 (4.1 참조) |
| 다중 운영자 협업 | 1인 운영자 가정 위배. 추후 phase |
| GUI 관리자 페이지 | Telegram + Supabase Dashboard 로 충분 → Build Gate 통과 |

이 5개를 **만들지 않은 덕분에** 6주 안에 production 까지 갔습니다. 만들었다면 12-18주 + 운영 부담 ↑↑.

### 4.3 Build Gate — "작동 데모 + 측정값" 약속

각 sprint 끝에 우리가 commit 한 것:

| Sprint | 작동 데모 | 측정값 |
|---|---|---|
| Sprint 0 | `demo/index.html` paste UI 에 50 문의 입력 → 신호 추출 | 분류 정확도 (수동 라벨 vs LLM 라벨) |
| Round 1 | email Worker + Supabase INSERT | round-trip latency (SES → INSERT < 3s) |
| Round 2 | channel-talk Worker + token 검증 | 무효 token 401 응답 시간 |
| Round 3 | auto-reply Worker + Tiered 룰 | False positive rate (잘못된 자동 응답 비율) |

매번 "**다음 데모까지 무엇이 작동해야 하는가**" 를 미리 적어두고, 측정 없는 release 는 금지했습니다.

## 5. 그래서 어떤 결과물이 나왔는가

### 5.1 코드 (전부 이 repo 안)

```
workers/
├── _shared/        ← PII 마스킹·idempotency·product_scope 분류·SHA-256 (재사용)
├── email-inbound/  ← SES → SNS → Worker → Supabase
├── channel-talk/   ← URL token 검증 + empty_text_policy
└── auto-reply/     ← Tiered Auto-Reply 5조건 AND 룰

supabase/
└── migrations/     ← 6 테이블 + 12 RLS policy + view + trigger + pg_cron

server.py + scripts/  ← P1 데모 백엔드 + Telegram 통지 + 스키마 검증
data/                 ← signal_schema, webhook_payload_schema, fixtures
demo/index.html       ← PMF Signal Radar UI (4탭 대시보드, 108KB)
remotion/             ← 데모 영상 컴포넌트
```

### 5.2 수치

- **92 test PASS**: Python 40 + TS 49 + retention 3
- **27 validate_schemas check PASS / 5 SKIP / 0 FAIL**
- **3 DB migration** scripts (`20260518000001~3`)
- **4 Cloudflare Workers** = 약 1,656 LOC TypeScript
- **1,500+ LOC Python** (server + scripts + tests)
- **6 weeks** from kickoff to production-ready (P1 강의 + P2 라이브)

### 5.3 결과를 가능하게 한 작업 패턴

- **5 persona worktree 격리** — 한 sprint 당 5명의 specialist agent (backend / debugger / quality / frontend / general) 가 각자의 worktree 에서 병렬 작업, 충돌 0
- **Cross-check 의무화** — 단일 agent 판단을 신뢰하지 않고, 모든 큰 결정에 2명 이상 컨펌 (Daisy 의 [feedback_build_harness] 패턴)
- **Phase 분리 = 작업 유형별** — Week 별이 아니라 "유지 → 변경 → 신규" 순으로 묶어서 배치 처리

## 6. 무엇이 잘 되었고, 무엇은 다시 안 할 것인가

### 잘 된 것
- **Evidence Gate 의 demote** — 약한 증거 5개를 backlog 로 보낸 덕에, 코드가 작고 빠르게 굳었다
- **5 persona worktree** — merge conflict 0, parallel 효율 5배
- **DB migration 4 함정 패턴 사전 방지** — 14자리 version·`.down.sql` 위치·`gen_random_uuid`·`CREATE POLICY drop block` 를 게이트로 체크 (`scripts/validate_schemas.py`)

### 다시 안 할 것
- **첫 Sprint 0 에서 SES Mail Manager 와 Email Receiving 혼동** — AWS 의 두 inbound 시스템을 잘못 진단해서 반나절을 잘못된 IAM 역할 만들기에 쓴 사고. **MX 1줄 (`dig MX <domain>`) 이 갈림길 결정**. 이런 외부 시스템 진단은 게이트 entry 부터 cross-check 필수.
- **prompts/ 디렉토리를 코드에서 직접 load 하지 않은 것** — 강의용 prompt 와 production prompt 를 같은 디렉토리에 두지 말 것. 분리하고 production 은 코드에 inline.

## 7. 이 패턴을 본인 프로젝트에 적용하려면

이 repo 의 **결과물** 은 모두 공개되어 있습니다. 하지만 **hplan 방법론 자체** (게이트 정의, 의사결정 로그, Ralph Loop 실행 흔적) 는 의도적으로 이 repo 에 포함하지 않았습니다 — skill 의 작동 방식 자체가 product 인 영역이라서.

만약 본인 프로젝트에 같은 패턴을 적용하고 싶다면:

1. **Evidence Gate 부터** — "강한 증거 3개" 정의를 명시적으로 적고, 적기 전에 코드 짜지 않기
2. **Product Gate 의 "안 만들 것 5개"** — Opportunity Tree 에서 명시적 push-down
3. **Build Gate 의 측정값 약속** — 다음 sprint 까지 정확히 무엇이 작동하고 어떤 수치가 나와야 하는지 미리 commit

이 repo 의 코드는 위 3 게이트를 모두 거친 결과의 한 점입니다. 같은 패턴으로 갈 때 본인의 코드가 어떻게 굳을지 추적하는 데 참고가 되길.

---

**Repo**: [github.com/kimsanguine/pmf_radar](https://github.com/kimsanguine/pmf_radar)
**Live demo**: (Cloudflare Pages 배포 후 추가)
**License**: MIT (LICENSE 파일 참조)
