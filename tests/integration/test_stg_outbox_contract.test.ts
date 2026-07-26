import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const migration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260726000005_signal_to_growth_outbox.sql"),
  "utf8"
);

describe("Signal to Growth restricted outbox migration", () => {
  it("requires opaque identity, policy, assurance, and explicit delivery state", () => {
    for (const field of [
      "source_record_ref",
      "customer_ref_hmac",
      "conversation_ref",
      "processing_basis_ref",
      "verification_assurance",
      "export_status",
      "retry_count",
      "dead_letter_reason",
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("'pending', 'blocked', 'dead_letter', 'exported'");
  });

  it("does not copy raw text or activate an automatic exporter", () => {
    expect(migration).not.toMatch(/masked_message\s+/i);
    expect(migration).not.toMatch(/raw_payload\s+jsonb/i);
    expect(migration).not.toMatch(/create\s+trigger/i);
    expect(migration).not.toMatch(/cron\.schedule/i);
  });
});
