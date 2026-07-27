/**
 * stg-bridge-export.test.ts
 *
 * webhook_inbox row -> pmf-radar.stg.v1 bridge record 변환 단위 테스트.
 */

import { describe, it, expect } from "vitest";
import {
  toStgBridgeRecord,
  isBridgeEligible,
  type WebhookInboxRow,
} from "../../_shared/stg-bridge-export";

const SECRET = "test-only-secret-not-real";

function row(overrides: Partial<WebhookInboxRow> = {}): WebhookInboxRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    source: "channel_talk",
    message_id: "ct-msg-001",
    channel: "channel_talk",
    segment: "초기 SaaS 운영자",
    masked_message: "결제 내역이 두 번 표시되어 확인을 요청합니다.",
    hitl_required: false,
    product_scope: "pmf_radar_lab",
    created_at: "2026-07-27T10:00:00.000Z",
    ...overrides,
  };
}

describe("isBridgeEligible", () => {
  it("channel_talk과 kakao_consultalk, manual_import는 대상이다", () => {
    expect(isBridgeEligible("channel_talk")).toBe(true);
    expect(isBridgeEligible("kakao_consultalk")).toBe(true);
    expect(isBridgeEligible("manual_import")).toBe(true);
  });

  it("kakao_channel_event는 관계 이벤트라 대상이 아니다", () => {
    expect(isBridgeEligible("kakao_channel_event")).toBe(false);
  });
});

describe("toStgBridgeRecord", () => {
  it("kakao_channel_event는 null을 반환한다 (PMF extraction 제외 정책과 동일)", async () => {
    const result = await toStgBridgeRecord(row({ source: "kakao_channel_event" }), {
      customerRefSecret: SECRET,
    });
    expect(result).toBeNull();
  });

  it("channel_talk row가 스키마가 요구하는 필드를 모두 채운다", async () => {
    const result = await toStgBridgeRecord(row(), { customerRefSecret: SECRET });
    expect(result).not.toBeNull();
    expect(result!.export_version).toBe("pmf-radar.stg.v1");
    expect(result!.event.provider).toBe("channel_talk");
    expect(result!.event.channel).toBe("channel_talk");
    expect(result!.event.event_id).toMatch(/^CSE-[A-Za-z0-9._-]{8,128}$/);
    expect(result!.event.conversation_ref).toMatch(/^(ref|hmac):[A-Za-z0-9_-]{8,192}$/);
    expect(result!.event.message_ref).toMatch(/^(ref|hmac):[A-Za-z0-9_-]{8,192}$/);
    expect(result!.event.customer_ref_hmac).toMatch(/^hmac(?:-sha256)?:[A-Za-z0-9_-]{16,128}$/);
    expect(result!.event.consent_or_processing_basis_ref).toMatch(/^POL-[A-Z0-9][A-Z0-9._-]{2,127}$/);
    expect(result!.event.idempotency_key.length).toBeGreaterThanOrEqual(16);
    expect(result!.event.canonical_status).toBe("normalized");
    expect(result!.event.attachment_metadata).toEqual([]);
    expect(result!.event.source_evidence_ids).toEqual([]);
  });

  it("kakao_consultalk source의 철자를 kakao_consulttalk으로 교정해서 emit한다", async () => {
    const result = await toStgBridgeRecord(row({ source: "kakao_consultalk" }), {
      customerRefSecret: SECRET,
    });
    expect(result!.event.provider).toBe("kakao_consulttalk");
    expect(result!.event.channel).toBe("kakao_consulttalk");
  });

  it("manual_import는 인증되지 않은 것으로 표시한다", async () => {
    const result = await toStgBridgeRecord(row({ source: "manual_import" }), {
      customerRefSecret: SECRET,
    });
    expect(result!.event.auth_verified).toBe(false);
    expect(result!.event.verification_assurance).toBe("none");
  });

  it("같은 row는 매번 같은 event_id를 만든다 (재실행 안정성)", async () => {
    const a = await toStgBridgeRecord(row(), { customerRefSecret: SECRET });
    const b = await toStgBridgeRecord(row(), { customerRefSecret: SECRET });
    expect(a!.event.event_id).toBe(b!.event.event_id);
  });

  it("message_id가 다르면 다른 event_id를 만든다", async () => {
    const a = await toStgBridgeRecord(row({ message_id: "ct-msg-001" }), {
      customerRefSecret: SECRET,
    });
    const b = await toStgBridgeRecord(row({ message_id: "ct-msg-002" }), {
      customerRefSecret: SECRET,
    });
    expect(a!.event.event_id).not.toBe(b!.event.event_id);
  });

  it("customerRefSecret이 다르면 customer_ref_hmac도 달라진다 (진짜 keyed HMAC)", async () => {
    const a = await toStgBridgeRecord(row(), { customerRefSecret: "secret-a" });
    const b = await toStgBridgeRecord(row(), { customerRefSecret: "secret-b" });
    expect(a!.event.customer_ref_hmac).not.toBe(b!.event.customer_ref_hmac);
  });

  it("masked_message를 그대로 content_redacted로 옮긴다 (재마스킹하지 않음)", async () => {
    const result = await toStgBridgeRecord(
      row({ masked_message: "환불 관련 문의입니다." }),
      { customerRefSecret: SECRET }
    );
    expect(result!.event.content_redacted).toBe("환불 관련 문의입니다.");
  });
});
