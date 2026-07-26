# Continuation handoff

- Updated: 2026-07-26
- Branch: `agent/signal-to-growth-bridge-v1`
- Last implementation commit: `81bbe35`
- Base commit: `9f515e4`
- Remote branch:
  `https://github.com/kimsanguine/pmf_radar/tree/agent/signal-to-growth-bridge-v1`
- Operational gate: **HOLD**

Read this file before changing PMF Radar's database, workers, or Signal to
Growth bridge.

## What exists

- `workers/_shared/stg-export.ts` converts a privacy-reduced normalized event
  to `pmf-radar.stg.v1`.
- The event ID is deterministic for provider plus provider event ID.
- Customer, conversation, message, and source identities must be opaque
  references.
- Raw payload locations must use a restricted reference.
- Known provider/channel mismatches and unmasked identifiers fail closed.
- `data/stg_export_fixture.jsonl` passes Signal to Growth's real dry-run import.
- Validation uses tracked public fixtures instead of ignored generated output.

## Verified state

| Surface | Result |
|---|---|
| Python tests | 40 passed |
| Email Worker | 21 tests passed; type-check passed |
| Channel Talk Worker | 7 tests passed; type-check passed |
| Auto Reply Worker | 33 tests passed; type-check passed |
| Data Ingest Worker | 29 tests passed; type-check passed |
| Schema-contract integration | 23 tests passed |
| Retention cleanup | 3 tests are documented separately |
| Repository schema validator | passed with documented SKIP items |
| Cross-repository import | one PMF event imported by Signal to Growth |

The CI workflow has been added. Remote execution evidence is pending the next
branch push; local tests are not remote CI evidence.

## Current implementation boundary

- `data-ingest` writes to `webhook_inbox`.
- `email-inbound` and `channel-talk` normalize events, but their Supabase insert
  remains placeholder code.
- Existing `webhook_inbox` rows do not provide all portable-export fields:
  `customer_ref_hmac`, `conversation_ref`, auth assurance, and processing-basis
  reference.
- The export adapter is pure and local. No queue, DB trigger, scheduler, or
  external network write invokes it.
- No Production worker, database migration, provider credential, or customer
  event was used for this bridge.

## Resume sequence

### 1. Reproduce the checkpoint

Use this isolated worktree. Do not switch the user's dirty
`/Users/sanguinekim/Documents/3_Code/pmf_radar` main worktree.

```bash
git switch agent/signal-to-growth-bridge-v1
git pull --ff-only
python3 -m pytest tests -q
python3 scripts/validate_schemas.py
```

For each Worker, install from its lockfile if `node_modules` is absent, then run:

```bash
npm ci
npm test
npm run type-check
```

Run this for `email-inbound`, `channel-talk`, `auto-reply`, and `data-ingest`.
Run `npm test` once more under `tests/integration`.

### 2. Confirm remote CI

`.github/workflows/ci.yml` mirrors the local Python, four Worker, and
integration-contract suites without deploying a Worker or applying a database
migration. After the next branch push, record the workflow URL and each job
result here. A successful source CI run is not a provider, Supabase, or
Production verification.

### 3. Design the restricted projection

Define a source contract for:

- opaque source record reference;
- provider and provider event ID;
- customer and conversation HMAC references;
- authentication assurance;
- processing-basis reference;
- restricted raw-payload reference;
- export status, retry count, and dead-letter reason.

Do not add raw customer text or direct identifiers.

### 4. Prepare, but do not apply, the database change

After the projection contract is reviewed, create a migration and contract
tests. Applying it to Supabase is a separate approval.

### 5. Wire an outbox/queue boundary

Generate the portable record only after normalization, redaction, and canonical
identity succeed. Conflicting replay, missing HMAC identity, or missing
processing basis must move to review/dead-letter state.

### 6. Re-run the cross-repository bridge

```bash
cd ../signal-to-growth
python3 scripts/stg.py import-pmf-radar \
  --input ../pmf-radar-signal-bridge/data/stg_export_fixture.jsonl
```

The import must remain dry-run unless `--write` and an explicit output directory
are intentionally supplied.

## Human approvals required

- Supabase schema or migration application
- Production Worker deployment
- provider credential configuration
- real customer event processing
- automatic export scheduling
- external reply or send
- merge to `main`

## Adjacent gate

Signal to Growth may turn the imported event into a human-reviewed growth
signal. hplan may then review an intake, but only hplan can record its Build Gate
decision.
