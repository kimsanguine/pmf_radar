# Signal to Growth handoff

PMF Radar와 Signal to Growth는 같은 일을 중복 수행하지 않는다.

| 시스템 | 책임 |
|---|---|
| PMF Radar | provider ingress, 인증, raw retention, normalization, masking, canonical identity, 운영 장애 복구 |
| Signal to Growth | verified event import, human-reviewed signal triage, evidence 연결, growth decision, metric, outcome |
| hplan | 승인된 문제·범위의 Build Gate 검토와 구현 handoff |

## 계약

PMF Radar는 `workers/_shared/stg-export.ts`의
`toSignalToGrowthExport()`로 `pmf-radar.stg.v1` record를 만든다.

필수 조건:

- customer, conversation, message는 HMAC 또는 opaque reference만 사용한다.
- customer message는 PMF Radar에서 먼저 마스킹한다.
- raw payload는 본문에 포함하지 않고 `restricted://` reference만 넘긴다.
- known provider와 channel의 product scope가 일치해야 한다.
- event ID는 provider와 provider event ID에서 결정론적으로 계산한다.
- PMF Radar 단계에서는 Signal to Growth evidence나 signal을 만들지 않는다.

공개 fixture는 `data/stg_export_fixture.jsonl`에 있다. Signal to Growth에서
다음처럼 dry-run 검증할 수 있다.

```bash
signal-to-growth import-pmf-radar \
  --input /path/to/pmf_radar/data/stg_export_fixture.jsonl
```

## 현재 구현 상태

- `data-ingest`는 Supabase `webhook_inbox` insert가 실제 연결돼 있다.
- `email-inbound`와 `channel-talk`는 normalization 코드가 있지만 현재
  source에는 `webhook_inbox` insert가 placeholder로 남아 있다.
- portable export 함수와 negative test는 로컬 구현이다.
- repository validator는 ignored `outputs/` 대신 tracked public validation
  fixture를 사용하므로 clean checkout에서도 재현된다.
- worker, DB trigger, queue, scheduler에서 export를 자동 실행하도록 연결하지
  않았다.
- 실제 고객 이벤트, provider credential, Production outbound는 검증하지 않았다.

따라서 이 변경은 **contract와 local adapter 구현**이며 Production 운영
연결을 뜻하지 않는다. 운영 연결 시에는 normalized row에 부족한
`customer_ref_hmac`, `conversation_ref`, auth assurance, processing basis를
먼저 DB 계약에 추가하거나 별도의 restricted projection에서 제공해야 한다.

## hplan 경계

Signal to Growth가 만드는 hplan intake는 Build Gate 입력 초안이다.
`hplan_gate_decision`은 Signal to Growth에서 만들지 않는다. hplan이 자체
evidence gate와 사람 승인을 통과한 뒤에만 구현 handoff가 생성된다.

현재 branch의 정확한 검증 상태와 다음 작업은
[`HANDOFF.md`](./HANDOFF.md)에서 이어간다.
