# Restricted projection contract: PMF Radar to Signal to Growth

## Purpose

`signal_to_growth_outbox` is a restricted, service-role-only projection queue.
It exists to make an already-normalized PMF Radar event eligible for the pure
`pmf-radar.stg.v1` adapter. It is not an evidence store, analytics event table,
or network delivery mechanism.

## Data minimization

The outbox may contain only opaque references and delivery metadata:

| Field | Rule |
|---|---|
| `source_record_ref` | `ref:` opaque ID; never a UUID exposed to a portable artifact |
| provider/event | provider plus provider event ID; used for canonical identity |
| customer/conversation/message | HMAC or opaque references only |
| auth | boolean plus `none/weak/medium/strong` assurance |
| policy | `POL-` processing-basis reference |
| raw payload | `restricted://` reference only; never payload text |
| state | pending, blocked, dead_letter, or exported plus retry metadata |

`masked_message` remains in `webhook_inbox`; an exporter may read it only after
the outbox row and its source row pass validation. The portable record can use
the already masked message but may not copy raw customer payload to the outbox.

## State transitions

```text
pending -> exported
pending -> blocked -> pending
pending|blocked -> dead_letter
```

- Missing opaque identity, policy reference, or verified provider mapping is
  `blocked`, not an inferred default.
- Replay conflict or invalid projection data is `dead_letter` with a bounded
  reason code; it is not silently retried.
- A worker may increment `retry_count` only while `pending` or `blocked`.
- The migration creates no trigger, queue consumer, schedule, HTTP request, or
  Signal to Growth write. Those require separate approval and E2E evidence.

## Export preconditions

1. `webhook_inbox` row is normalized and masked.
2. `source_record_ref`, customer HMAC, conversation reference, and policy
   reference match their opaque formats.
3. provider/channel mapping and authentication assurance are known.
4. outbox status is `pending`, not blocked or dead-lettered.
5. `toSignalToGrowthExport()` validates the final portable record.

## Ownership boundary

PMF Radar owns ingress, retention, this projection, retry/dead-letter state,
and provider truth. Signal to Growth owns dry-run import and human-reviewed
signal triage. hplan owns the independent Build Gate.
