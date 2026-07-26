# Classroom trial pack

PMF Signal Radar의 90분 수업용 public-dummy 실행 계약이다. 실제 고객 원문,
credential, Production endpoint는 사용하지 않는다.

## 준비

- Python 3.13+
- Node 20+
- `data/sample_inquiries.json`
- `data/validation/signal_extraction_sample.json`
- `data/validation/rehearsal_signal_extraction_10.json`

## 6단계

1. **Input** — 공개 고객 문의 fixture에서 한 건을 고른다.
2. **Normalize** — channel과 message identity가 canonical 형태인지 확인한다.
3. **Mask** — 직접 식별자가 결과에 남지 않았는지 확인한다.
4. **Classify** — pain, Four Forces, evidence strength를 관찰 사실과 구분한다.
5. **Reply/HITL** — 초안과 승인 상태를 분리한다. 외부 발송은 하지 않는다.
6. **Backlog** — strong signal, 반대 근거, 다음 실험, stop rule을 기록한다.

## 검증

```bash
python3 scripts/validate_schemas.py
python3 -m pytest tests -q
```

수업 완료는 fixture와 local validation의 성공만 뜻한다. provider account
연결, Supabase row 생성, 외부 reply, Production 운영은 별도 증거가 필요하다.
