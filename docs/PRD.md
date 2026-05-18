# PRD: CS Inbox to PMF Radar Lab

Status: P1 = `CONDITIONAL_GO_PLUS` (강의 카논, P1 hplan Workflow Ready) / P2 = sprint 0 완료, 6주 Rollout 진행 (see `docs/PRD-P2.md` v0.1, `docs/P2_DESIGN.md` v0.2)  
Owner: Claude Code로 배우는 PM적 사고 강의 + 1인 운영자 라이브 운영 (P2)  
Last updated: 2026-05-18

## 1. Summary

`CS Inbox to PMF Radar Lab`은 카카오톡/채널톡 고객문의 데이터를 Claude Code와 hplan으로 분석하여, 고객 불편을 PMF 증거, pain cluster, Opportunity Solution Tree, 제품 개선 실험으로 전환하는 강의용 실습이자 MVP 후보 제품이다.

이 실습의 목적은 단순 상담 자동화 챗봇을 만드는 것이 아니다. 하지만 카카오톡 계열 문의 연동은 MVP의 필수 현실 조건이다. 수강생은 "고객 불만을 기능 요청으로 바로 바꾸는 것"과 "고객 불만을 PMF evidence로 구조화한 뒤 제품 판단으로 연결하는 것"의 차이를 체감해야 한다.

## 2. Problem

Claude Code를 배우는 PM/PO/창업자는 도구 사용법 자체보다 다음 지점에서 막힌다.

- 고객 피드백, CS 문의, 오픈채팅 질문이 흩어져 있어 무엇이 강한 신호인지 판단하기 어렵다.
- AI가 분류와 요약을 해도 PMF, JTBD, hplan 판단으로 이어지지 않으면 단순 자동화 데모로 끝난다.
- 칭찬, 기능 요청, 실제 이탈/구매 트리거를 구분하지 못하면 잘못된 PRD로 이어진다.
- 강의 실습에서 "와, 이렇게도 할 수 있구나"를 느끼려면 텍스트 요약보다 시각화와 게이트 판단 장면이 필요하다.

## 3. Target User

Primary ICP:

- Claude Code를 배우고 싶은 비개발 PM/PO/창업자
- 고객 인터뷰, CS 문의, 강의 피드백, 커뮤니티 질문을 제품 개선으로 연결해야 하는 사람
- 터미널과 코드 변경은 낯설지만, AI 에이전트를 PM 업무에 적용하고 싶은 사람

Secondary ICP:

- 팀 교육 담당자
- 강의/커뮤니티 운영자
- AI 자동화 강의를 기획하는 교육자

## 4. Desired Outcome

수강생이 90분 안에 고객문의 샘플 또는 수동 import 문의를 다음 산출물로 전환한다.

- PMF signal records
- Pain cluster map
- Strong/medium/weak evidence 판정
- What Not To Build
- hplan Evidence Gate decision
- Opportunity Solution Tree
- 개선 실험 3개
- FAQ/답변 초안 후보
- 답변 초안/HITL/Backlog 분기 흐름

## 5. MVP Must-Haves

- Kakao-style manual import
- Kakao 상담톡 integration path 설계
- Channel adapter schema
- Local API-backed hplan classifier
- PMF evidence extraction
- Evidence bubble map visualization
- hplan decision panel
- What Not To Build panel
- Reply draft with human review
- Improvement backlog

## 6. Non-Goals

이번 강의 실습(P1)에서는 하지 않는다. 운영자 라이브 운영(P2)에서의 갱신은 §14 참조.

- 비공식 카카오톡 오픈채팅 자동화/스크래핑 (P2 에서도 정책상 금지 — manual paste 만)
- ~~실제 채널톡 계정 live 연동~~ → P2.2 에서 sandbox 진입 (see `docs/PRD-P2.md` §5)
- ~~고객에게 바로 자동 발송되는 상담봇~~ → P2 에서 **Tiered Auto-Reply** 일부 허용 (이메일·사전 승인 템플릿·5조건 AND·일일 ≤20건, see `data/signal_schema.json::auto_reply_trigger_rules`)
- 결제/환불/개인정보 처리 자동화 (P2 에서도 manager_review_required)
- 대형 운영용 CRM 대시보드 (P2 에서도 운영자 단일 알림 채널 = Telegram)
- ~~production-grade backend 구축~~ → P2.2 에서 Cloudflare Workers + Supabase (운영자 자기 사용 한정, 강의 자료 격리 유지)

## 7. Core User Stories

1. 수강생으로서, 나는 고객문의 원문을 보고 어떤 것이 강한 PMF 신호인지 구분하고 싶다.
2. 수강생으로서, 나는 Claude Code가 문의를 Push, Anxiety, Workaround, Trigger로 변환하는 과정을 보고 싶다.
3. 강사로서, 나는 문의함이 PMF Radar로 바뀌는 시각적 장면을 보여주고 싶다.
4. PM으로서, 나는 칭찬과 기능 요청을 그대로 믿지 않고 Evidence Gate에서 검문하고 싶다.
5. PM으로서, 나는 pain cluster를 Opportunity Solution Tree와 개선 실험으로 연결하고 싶다.
6. 운영자로서, 나는 카카오톡/채널톡/수동 import 문의를 같은 schema로 정규화하고 싶다.
7. 운영자로서, 나는 자동답변 전 human review queue에서 답변 초안을 검토하고 싶다.

## 8. MVP Scope

MVP에 포함한다.

- Mock 고객문의 50개
- PMF signal extraction schema
- Claude Code 실습 프롬프트 2개
- hplan Evidence Gate 템플릿
- hplan Product Gate 초안
- Opportunity Solution Tree 예시
- 강사용 90분 진행 가이드
- Local API-backed PMF Radar 데모 화면
- 카카오 연동 설계 문서
- 경쟁사 기반 MVP 기능 정의
- Remotion 시연 영상
- 6단계 hplan workflow rail
- `02 hplan 신호 분석` 다이어그램: 문의 원문 → PII 마스킹 → hplan evidence → Intent/Anxiety/Workaround/Trigger → 답변/HITL/Backlog

MVP에서 제외한다.

- production-grade 데이터 저장소
- 서버 저장소
- 로그인/권한
- 실제 카카오톡/채널톡 live account 연결
- 자동응답 전송

## 9. Experience Requirements

실습은 다음 감정 곡선을 만들어야 한다.

1. "이건 그냥 문의 아닌가?"
2. "문의가 Push/Anxiety/Workaround로 바뀌네?"
3. "칭찬은 약한 증거로 내려가네?"
4. "아, PM은 기능을 만드는 게 아니라 증거를 판별하는구나."
5. "이걸 내 고객문의/강의피드백/커뮤니티에도 적용할 수 있겠다."

## 10. Success Metrics

강의 실습 성공 기준:

- 90분 안에 모든 수강생이 Evidence Gate decision을 1개 이상 만든다.
- 수강생 80% 이상이 strong evidence와 weak evidence 차이를 설명한다.
- 수강생 70% 이상이 자기 업무 적용 사례를 1개 이상 말한다.
- 수강생 50% 이상이 "고객문의 분석"보다 "PMF 판단 루프"로 실습을 설명한다.

추가 검증 기준:

- 실제 수강생/예비수강생 5명 중 3명 이상이 이 실습을 강의 핵심 데모로 기억한다.
- 5명 중 3명 이상이 자신의 실제 데이터로 다시 해보고 싶다고 말한다.

## 11. hplan Gate Status

| 트랙 | Decision | 근거 |
|------|----------|------|
| P1 강의 카논 | `CONDITIONAL_GO_PLUS` | hplan helper 77점, mock 기반 build 판정. 강의 실습으로는 진행 가치 충분 |
| P2 운영자 라이브 | `build` (sprint 0 완료) | server.py P2.1 hardening + 12 unit test PASS. 단 evidence_gate(5명 인터뷰) 별도 트랙 |

공통 라인:
- 카카오톡 연동은 MVP 필수 현실 조건. P2 에서 4채널 통합(이메일·CT·오픈채팅·카카오 상담) 으로 확장.
- 비공식 오픈채팅 자동화는 금지 유지. P2 도 manual paste 만.
- **Tiered Auto-Reply** (이메일·사전 승인 템플릿·5조건 AND) 만 허용, LLM 생성 답변 자동 발송은 X.
- 운영자 라이브 운영은 강의 자료에 노출하지 않음 (강의는 mock 카논 유지).
- 5명 인터뷰(B2B PM 3 + 강의 수강생 2)는 P2 와 직교한 evidence_gate 닫기 트랙.

## 12. Open Questions

- 수강생이 실제로 가장 크게 감탄하는 장면은 Radar 화면인가, strong/weak 판정인가, What Not To Build인가?
- 90분 안에 Claude Code 프롬프트 실행과 hplan 토론을 모두 소화할 수 있는가?
- mock 데이터가 충분히 현실적으로 느껴지는가?
- 강의 본편에서 실제 카카오톡/채널톡 연동을 어디까지 언급할 것인가?
- 수강생이 가져갈 최종 산출물은 Markdown 리포트가 좋은가, HTML 화면이 좋은가?
- Kakao 상담톡 딜러사/API 확보 경로는 무엇인가?
- P0에서 manual import만으로 충분한가, Channel Talk webhook까지 들어가야 하는가?

## 13. Launch Criteria

강의에 넣기 전 최소 조건:

- [x] Mock 문의 50개 준비
- [x] 30분 리허설용 문의 10개 준비
- [x] Signal schema 준비
- [x] Claude Code 프롬프트 준비
- [x] hplan Evidence/Product Gate 초안 준비
- [x] 정적 PMF Radar 화면 준비
- [x] 강사용 진행 가이드 준비
- [x] Signal extraction 샘플 output 준비
- [x] 리허설용 signal extraction 샘플 output 준비
- [x] Improvement report 샘플 output 준비
- [x] hplan decision log 기록
- [x] 리허설 checkpoint 준비
- [x] Ralph PRD/task board 생성
- [x] 참가자 핸드아웃 준비
- [x] 강사용 answer key 준비
- [x] classroom trial pack 준비
- [x] 시장 리서치 재검토
- [x] Kakao integration spec 작성
- [x] competitive MVP spec 작성
- [x] Evidence bubble map 시각화 추가
- [x] Local server `/api/classify` 기반 hplan 분석 실행
- [x] CSV/JSON/manual import UI
- [x] 6단계 hplan workflow rail
- [x] `02 hplan 신호 분석` workflow diagram 개선
- [x] Remotion 시연 영상 제작 및 hero 배치
- [x] `/api/integration-status`로 live 연동 준비 상태 노출
- [ ] Claude Code 실제 실행 화면 캡처
- [ ] 수강생 1-2명 대상 리허설
- [ ] 리허설 후 문의 데이터와 진행 시간 조정

P2 Launch Criteria 는 `docs/PRD-P2.md` §20 참조.

## 14. P2 Roadmap (요약)

P1 = 강의 카논, P2 = 운영자 라이브 운영 (직교 트랙). 자세한 내용은 `docs/PRD-P2.md` v0.1 + `docs/P2_DESIGN.md` v0.2.

- **4채널 인입**: 이메일(AWS SES Tokyo, 1순위, MX 이미 설정) + Channel Talk + 오픈채팅 manual paste + 카카오 상담(P2.4 후순위)
- **production 인프라**: Cloudflare Workers + Supabase (habix.ai 기존 스택 재사용)
- **Tiered Auto-Reply**: 이메일·사전 승인 템플릿·5조건 AND·일일 ≤20건. 룰 = `data/signal_schema.json::auto_reply_trigger_rules`.
- **Validation Harness**: Ralph verify 훅 편입 (15→25 check + 문서 lint matrix)
- **PIPA 보호**: raw payload 30일 자동삭제 cron, Telegram 알림 포인터 전용
- **운영자 burnout 회피**: 오프타임(22:00–08:00 KST) batch
- **6주 Rollout**: P2.1 sprint 0 (2026-05-18 완료, 12 unit test PASS) → P2.2 인입·인프라 (2주) → P2.3 validation (1주) → 운영 1주 → P2.4 카카오 평가 (1주)
- **hplan 정직 라벨**: P2 는 evidence_gate 를 *건너뛰지 않음*. 5명 인터뷰는 별도 트랙.

P2 분할:
- P2.1 receiver hardening (server.py + unit test 12개) — **완료** ✅
- P2.2 production multi-channel (Workers + Supabase + Telegram + Auto-Reply)
- P2.3 validation harness 확장
- P2.4 카카오 상담 트랙 (Sinch/파트너 평가)
