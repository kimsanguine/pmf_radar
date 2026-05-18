/**
 * SES 이메일 payload → normalized_inquiry_fields 변환
 *
 * server.py::normalize_webhook_payload / mask_pii 를 TypeScript 로 1:1 포팅.
 *
 * SES inbound JSON 구조 (SNS Notification.Message 내부):
 * {
 *   "notificationType": "Received",
 *   "mail": {
 *     "messageId": "...",
 *     "timestamp": "...",
 *     "source": "sender@example.com",
 *     "destination": ["cs@habix.ai"],
 *     "commonHeaders": {
 *       "from": ["Sender Name <sender@example.com>"],
 *       "to": ["cs@habix.ai"],
 *       "subject": "제목",
 *       "date": "..."
 *     },
 *     "headers": [{ "name": "...", "value": "..." }, ...]
 *   },
 *   "content": "원시 MIME 이메일 (base64 or raw string)",
 *   "receipt": { ... }
 * }
 */

/** normalize 후 결과물 (channel_adapter_schema.json normalized_inquiry_fields 호환) */
export interface NormalizedInquiry {
  id: string;
  source: string;
  channel: "email";
  segment: string;
  message: string;          // mask_pii 적용 후
  received_at: string;      // ISO-8601
  sender_id_hash: string;   // sha-256 hex of sender email
  product_scope: ProductScope;
  signature_verified: boolean;
}

export type ProductScope = "habix_course" | "pmf_radar_lab" | "other";

/** SES mail 객체 */
interface SesMailObject {
  messageId?: string;
  timestamp?: string;
  source?: string;
  destination?: string[];
  commonHeaders?: {
    from?: string[];
    subject?: string;
    date?: string;
  };
}

/** SES Notification.Message 파싱 결과 */
export interface SesPayload {
  notificationType?: string;
  mail?: SesMailObject;
  content?: string;
}

// ---------------------------------------------------------------------------
// mask_pii — server.py:148-155 와 동일 패턴 (6개 정규식 1:1 포팅)
// ---------------------------------------------------------------------------

/**
 * PII 마스킹 (server.py::mask_pii 1:1 TypeScript 포팅)
 *
 * 적용 순서:
 * 1. 이메일 주소 → [이메일]
 * 2. 국내 휴대전화 → [전화번호]
 * 3. 하이픈 구분 주문번호(숫자 패턴) → [주문번호]
 * 4. 한글 이름 + 직책/조사 → [이름]
 * 5. 회사명(주식회사/㈜/영문 법인) → [회사명]
 * 6. 대문자 영문 코드 + 6자리 이상 숫자 주문번호 → [주문번호]
 */
export function maskPii(text: string): string {
  // 1. 이메일 (server.py line 149)
  let masked = text.replace(
    /[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}/g,
    "[이메일]"
  );

  // 2. 국내 휴대전화 (server.py line 150)
  masked = masked.replace(
    /01[016789][-\s.]?\d{3,4}[-\s.]?\d{4}/g,
    "[전화번호]"
  );

  // 3. 하이픈 구분 주문번호 (server.py line 151)
  masked = masked.replace(
    /\b\d{3,4}[-\s]\d{4}[-\s]\d{4}\b/g,
    "[주문번호]"
  );

  // 4. 한글 이름 + 직책/조사 lookahead (server.py line 152)
  // Python: r"[가-힣]{2,4}\s*(씨|님|대표|...) (?=[은는이가을를도와과의에서로께,.\s!?]|$)"
  // JS 는 lookbehind/lookahead 모두 지원하므로 동일하게 포팅
  masked = masked.replace(
    /[가-힣]{2,4}\s*(?:씨|님|대표|매니저|팀장|과장|부장|차장|이사|책임|선임|주임)(?=[은는이가을를도와과의에서로께,.\s!?]|$)/g,
    "[이름]"
  );

  // 5. 회사명 (server.py line 153)
  // Python: r"(주식회사\s*[가-힣A-Za-z0-9]+|㈜\s*[가-힣A-Za-z0-9]+|[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\s+(?:Inc|Co|Ltd|Corp)\.?)"
  masked = masked.replace(
    /(?:주식회사\s*[가-힣A-Za-z0-9]+|㈜\s*[가-힣A-Za-z0-9]+|[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)*\s+(?:Inc|Co|Ltd|Corp)\.?)/g,
    "[회사명]"
  );

  // 6. 대문자 영문코드 + 숫자 주문번호 (server.py line 154)
  // Python: r"\b[A-Z]{2,}[-_]?\d{6,}\b"
  masked = masked.replace(
    /\b[A-Z]{2,}[-_]?\d{6,}\b/g,
    "[주문번호]"
  );

  return masked;
}

// ---------------------------------------------------------------------------
// 이메일 본문 추출 — MIME multipart 에서 text/plain 우선
// ---------------------------------------------------------------------------

/**
 * SES content(raw MIME) 에서 텍스트 본문 추출
 *
 * 단순 정규식 기반 파싱 (외부 라이브러리 없음).
 * text/plain part 우선, 없으면 subject fallback.
 */
export function extractTextFromMime(rawMime: string): string {
  // base64 인코딩된 경우 디코드 시도
  const decoded = tryBase64Decode(rawMime);
  const content = decoded ?? rawMime;

  // multipart boundary 탐색
  const boundaryMatch = content.match(/boundary="([^"]+)"/i) ?? content.match(/boundary=([^\s;]+)/i);

  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = content.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));

    for (const part of parts) {
      if (/content-type:\s*text\/plain/i.test(part)) {
        const bodyStart = part.indexOf("\r\n\r\n");
        if (bodyStart !== -1) {
          const rawBody = part.slice(bodyStart + 4).trim();
          // quoted-printable 디코드
          if (/content-transfer-encoding:\s*quoted-printable/i.test(part)) {
            return decodeQuotedPrintable(rawBody);
          }
          // base64 part
          if (/content-transfer-encoding:\s*base64/i.test(part)) {
            return tryBase64Decode(rawBody.replace(/\s/g, "")) ?? rawBody;
          }
          return rawBody;
        }
      }
    }
  }

  // multipart 없는 단순 메시지 — 헤더 이후 본문
  const bodyStart = content.indexOf("\r\n\r\n");
  if (bodyStart !== -1) {
    return content.slice(bodyStart + 4).trim();
  }

  return content.trim();
}

function tryBase64Decode(s: string): string | null {
  try {
    return atob(s);
  } catch {
    return null;
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

// ---------------------------------------------------------------------------
// sender_id_hash — SHA-256 hex (Web Crypto)
// ---------------------------------------------------------------------------

export async function hashSenderId(email: string): Promise<string> {
  const data = new TextEncoder().encode(email.toLowerCase().trim());
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// product_scope 분류 — 키워드 기반 (LLM 사용 금지, Rule 5)
// ---------------------------------------------------------------------------

const HABIX_COURSE_KEYWORDS = [
  "강의", "수업", "수강", "커리큘럼", "과제", "실습", "튜토리얼",
  "habix course", "habix_course", "학습", "교육과정",
];

const PMF_RADAR_KEYWORDS = [
  "pmf", "radar", "피드백", "제품", "기능", "개선", "버그",
  "pmf radar", "pmf_radar", "신청", "도입", "영업",
];

export function classifyProductScope(subject: string, body: string): ProductScope {
  const combined = `${subject} ${body}`.toLowerCase();

  const hasCourse = HABIX_COURSE_KEYWORDS.some((kw) => combined.includes(kw));
  const hasPmf = PMF_RADAR_KEYWORDS.some((kw) => combined.includes(kw));

  if (hasCourse && !hasPmf) return "habix_course";
  if (hasPmf && !hasCourse) return "pmf_radar_lab";
  if (hasCourse && hasPmf) return "habix_course"; // 강의 우선
  return "other";
}

// ---------------------------------------------------------------------------
// 메인 정규화 함수
// ---------------------------------------------------------------------------

/**
 * SES payload(SNS Message 내부 JSON) → NormalizedInquiry 배열
 *
 * @param rawSesJson - SNS Notification.Message 값 (JSON 문자열)
 * @param signatureVerified - sns-verify.ts 검증 결과
 */
export async function normalizeSesPayload(
  rawSesJson: string,
  signatureVerified: boolean
): Promise<NormalizedInquiry[]> {
  let sesPayload: SesPayload;
  try {
    sesPayload = JSON.parse(rawSesJson) as SesPayload;
  } catch {
    return [];
  }

  const mail = sesPayload.mail;
  if (!mail || sesPayload.notificationType !== "Received") {
    return [];
  }

  const messageId = mail.messageId ?? `ses-${Date.now()}`;
  const receivedAt = mail.timestamp ?? new Date().toISOString();
  const senderEmail = mail.source ?? "";
  const subject = mail.commonHeaders?.subject ?? "";

  // 본문 추출 → PII 마스킹
  const rawBody = sesPayload.content ? extractTextFromMime(sesPayload.content) : subject;
  const maskedBody = maskPii(rawBody.slice(0, 900));
  const maskedSubject = maskPii(subject);

  if (!maskedBody.trim() && !maskedSubject.trim()) {
    return [];
  }

  const senderHash = await hashSenderId(senderEmail);
  const productScope = classifyProductScope(maskedSubject, maskedBody);

  const message = maskedBody.trim() || maskedSubject.trim();

  return [
    {
      id: messageId,
      source: "ses_inbound",
      channel: "email",
      segment: "email customer",
      message,
      received_at: receivedAt,
      sender_id_hash: senderHash,
      product_scope: productScope,
      signature_verified: signatureVerified,
    },
  ];
}
