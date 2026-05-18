/**
 * AWS SNS Message Signature Version 1 검증
 *
 * 검증 절차:
 * 1. X-Amz-SNS-Signature 헤더에서 base64 서명 추출
 * 2. SigningCertURL 로부터 X.509 인증서 다운로드 (AWS SNS 공식 도메인 검증 필수)
 * 3. 인증서에서 RSA 공개키 추출
 * 4. SNS 메시지 유형별 정규화된 서명 문자열 구성
 * 5. RSA-SHA1 검증 (SubtleCrypto)
 *
 * 보안 주의:
 * - SigningCertURL 은 반드시 sns.*.amazonaws.com 도메인이어야 함 (SSRF 방지)
 * - 인증서 캐시는 메모리 한정 (Workers KV 사용은 Round 2 에서 추가 가능)
 */

const ALLOWED_CERT_DOMAIN = /^https:\/\/sns\.[a-z0-9-]+\.amazonaws\.com\//;

/** SNS 메시지 유형 */
export type SnsMessageType = "SubscriptionConfirmation" | "Notification" | "UnsubscribeConfirmation";

/** 파싱된 SNS 메시지 구조 */
export interface SnsMessage {
  Type: SnsMessageType;
  MessageId: string;
  TopicArn: string;
  Message: string;
  Timestamp: string;
  SignatureVersion: string;
  Signature: string;
  SigningCertURL: string;
  // SubscriptionConfirmation 전용
  Token?: string;
  SubscribeURL?: string;
  // Notification 전용
  Subject?: string;
  UnsubscribeURL?: string;
}

/**
 * SNS 서명 문자열 구성 (AWS 공식 명세)
 *
 * Notification: Message, MessageId, Subject(있을 때), Timestamp, TopicArn, Type
 * SubscriptionConfirmation / UnsubscribeConfirmation:
 *   Message, MessageId, SubscribeURL, Timestamp, Token, TopicArn, Type
 */
function buildSigningString(msg: SnsMessage): string {
  const pairs: Array<[string, string]> = [];

  if (msg.Type === "Notification") {
    pairs.push(["Message", msg.Message]);
    pairs.push(["MessageId", msg.MessageId]);
    if (msg.Subject !== undefined) {
      pairs.push(["Subject", msg.Subject]);
    }
    pairs.push(["Timestamp", msg.Timestamp]);
    pairs.push(["TopicArn", msg.TopicArn]);
    pairs.push(["Type", msg.Type]);
  } else {
    // SubscriptionConfirmation | UnsubscribeConfirmation
    pairs.push(["Message", msg.Message]);
    pairs.push(["MessageId", msg.MessageId]);
    pairs.push(["SubscribeURL", msg.SubscribeURL ?? ""]);
    pairs.push(["Timestamp", msg.Timestamp]);
    pairs.push(["Token", msg.Token ?? ""]);
    pairs.push(["TopicArn", msg.TopicArn]);
    pairs.push(["Type", msg.Type]);
  }

  return pairs.map(([k, v]) => `${k}\n${v}\n`).join("");
}

/**
 * PEM 인증서에서 RSA 공개키를 SubtleCrypto CryptoKey 로 임포트
 *
 * PEM → DER(base64 decode) → SubtleCrypto.importKey("spki")
 */
async function importPublicKeyFromPem(pem: string): Promise<CryptoKey> {
  // PEM 헤더/푸터 제거 후 base64 추출
  const base64 = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, "")
    .replace(/-----END CERTIFICATE-----/g, "")
    .replace(/\s+/g, "");

  const derBuffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  // X.509 인증서 전체를 SubtleCrypto 로 임포트 (spki 는 SubjectPublicKeyInfo)
  // Cloudflare Workers SubtleCrypto 는 "x509" 포맷을 지원하지 않으므로
  // DER 파싱 후 SubjectPublicKeyInfo offset 을 수동으로 추출해야 함.
  // 단순화: Workers 에서 사용 가능한 "raw" X.509 는 없으므로 커스텀 DER 파서 사용.
  const spkiDer = extractSpkiFromX509Der(derBuffer);

  return await crypto.subtle.importKey(
    "spki",
    spkiDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-1" },
    false,
    ["verify"]
  );
}

/**
 * X.509 DER 에서 SubjectPublicKeyInfo(SPKI) 바이트 추출
 *
 * ASN.1 DER 구조 기준:
 *   Certificate SEQUENCE
 *     TBSCertificate SEQUENCE
 *       ... (version, serialNumber, signature, issuer, validity, subject)
 *       subjectPublicKeyInfo SEQUENCE  ← 여기
 *
 * AWS SNS 인증서는 RSA 2048 표준 구조이므로 길이 필드 파싱으로 충분.
 */
function extractSpkiFromX509Der(der: Uint8Array): Uint8Array {
  let offset = 0;

  // Certificate SEQUENCE 건너뜀
  offset = skipSequenceTag(der, offset);

  // TBSCertificate SEQUENCE 건너뜀
  offset = skipSequenceTag(der, offset);

  // TBSCertificate 내부 필드 순서대로 건너뜀:
  // version [0] EXPLICIT (optional, tag 0xa0)
  if (der[offset] === 0xa0) {
    offset = skipTlv(der, offset);
  }
  // serialNumber INTEGER
  offset = skipTlv(der, offset);
  // signature AlgorithmIdentifier SEQUENCE
  offset = skipTlv(der, offset);
  // issuer Name SEQUENCE
  offset = skipTlv(der, offset);
  // validity SEQUENCE
  offset = skipTlv(der, offset);
  // subject Name SEQUENCE
  offset = skipTlv(der, offset);

  // subjectPublicKeyInfo SEQUENCE — 여기서부터 끝까지가 SPKI
  const spkiStart = offset;
  offset = skipTlv(der, offset);
  return der.slice(spkiStart, offset);
}

/** ASN.1 SEQUENCE(0x30) 태그를 확인하고 content 시작 offset 반환 */
function skipSequenceTag(der: Uint8Array, offset: number): number {
  if (der[offset] !== 0x30) {
    throw new Error(`Expected SEQUENCE (0x30) at offset ${offset}, got 0x${der[offset].toString(16)}`);
  }
  return readLength(der, offset + 1).contentStart;
}

/** 현재 TLV 전체(태그+길이+값)를 건너뛴 다음 offset 반환 */
function skipTlv(der: Uint8Array, offset: number): number {
  const { length, contentStart } = readLength(der, offset + 1);
  return contentStart + length;
}

/** ASN.1 길이 필드 파싱. offset 은 태그 다음 위치. */
function readLength(der: Uint8Array, offset: number): { length: number; contentStart: number } {
  const first = der[offset];
  if (first < 0x80) {
    return { length: first, contentStart: offset + 1 };
  }
  const numBytes = first & 0x7f;
  let length = 0;
  for (let i = 0; i < numBytes; i++) {
    length = (length << 8) | der[offset + 1 + i];
  }
  return { length, contentStart: offset + 1 + numBytes };
}

/** 인증서 캐시 (메모리, Worker 수명 동안 유지) */
const certCache = new Map<string, CryptoKey>();

/**
 * SigningCertURL 에서 인증서 다운로드 후 공개키 반환 (캐시 포함)
 */
async function fetchPublicKey(certUrl: string): Promise<CryptoKey> {
  if (!ALLOWED_CERT_DOMAIN.test(certUrl)) {
    throw new Error(`SNS cert URL 도메인 불일치: ${certUrl}`);
  }
  const cached = certCache.get(certUrl);
  if (cached) return cached;

  const resp = await fetch(certUrl);
  if (!resp.ok) {
    throw new Error(`인증서 다운로드 실패: HTTP ${resp.status}`);
  }
  const pem = await resp.text();
  const key = await importPublicKeyFromPem(pem);
  certCache.set(certUrl, key);
  return key;
}

/**
 * SNS Message Signature Version 1 검증 메인 함수
 *
 * @returns true = 서명 유효 / false = 서명 불일치 또는 검증 불가
 * @throws Error — 도메인 불일치, 네트워크 오류, 파싱 오류
 */
export async function verifySnsSignature(msg: SnsMessage): Promise<boolean> {
  if (msg.SignatureVersion !== "1") {
    throw new Error(`지원하지 않는 SNS SignatureVersion: ${msg.SignatureVersion}`);
  }

  const publicKey = await fetchPublicKey(msg.SigningCertURL);
  const signingString = buildSigningString(msg);

  const signatureBytes = Uint8Array.from(atob(msg.Signature), (c) => c.charCodeAt(0));
  const messageBytes = new TextEncoder().encode(signingString);

  return await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    publicKey,
    signatureBytes,
    messageBytes
  );
}

/**
 * raw Request body 를 SnsMessage 로 파싱
 * JSON 파싱 실패 시 null 반환 (호출자가 400 처리)
 */
export function parseSnsMessage(body: string): SnsMessage | null {
  try {
    const parsed = JSON.parse(body);
    if (!parsed.Type || !parsed.MessageId || !parsed.Signature || !parsed.SigningCertURL) {
      return null;
    }
    return parsed as SnsMessage;
  } catch {
    return null;
  }
}
