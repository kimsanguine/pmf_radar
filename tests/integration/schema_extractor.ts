/**
 * schema_extractor.ts
 *
 * supabase/migrations/20260518000001_p2_inbox_schema.sql 에서
 * webhook_inbox 테이블 컬럼 정의를 정규식으로 추출한다.
 *
 * SQL parser 미사용 — 마이그레이션 파일이 1개이고 형식이 고정되어 있으므로
 * 정규식으로 충분하다 (Rule 2 Simplicity).
 *
 * 반환하는 ColumnDef 배열은 contract 검증의 ground truth 로 쓰인다.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

export interface ColumnDef {
  name: string;
  /** SQL 타입 (소문자 정규화, e.g. "text", "uuid", "boolean", "jsonb", "timestamptz") */
  type: string;
  notNull: boolean;
  /** DB 기본값이 있으면 true (INSERT 생략 가능) */
  hasDefault: boolean;
}

/** webhook_inbox ground-truth 컬럼 목록 (schema에서 추출) */
export interface WebhookInboxSchema {
  columns: ColumnDef[];
  /** NOT NULL + no default → INSERT 시 반드시 포함해야 하는 컬럼 이름 */
  requiredForInsert: string[];
  /** CHECK constraint 값 목록 (product_scope enum) */
  productScopeValues: string[];
  /** UNIQUE(source, message_id) 복합 유니크 컬럼 이름 쌍 */
  uniquePair: [string, string];
}

const MIGRATION_PATH = resolve(
  __dirname,
  "../../supabase/migrations/20260518000001_p2_inbox_schema.sql"
);

/**
 * SQL에서 webhook_inbox 테이블 블록을 추출해 컬럼 정의를 파싱한다.
 *
 * 파싱 전략:
 * 1. CREATE TABLE public.webhook_inbox ( ... ) 블록 추출
 * 2. 각 줄을 컬럼 정의 패턴으로 매칭
 * 3. NOT NULL / DEFAULT / PK constraint 추출
 */
export function extractWebhookInboxSchema(): WebhookInboxSchema {
  const sql = readFileSync(MIGRATION_PATH, "utf-8");

  // webhook_inbox 테이블 블록 추출 (닫는 세미콜론까지)
  const tableMatch = sql.match(
    /create table if not exists public\.webhook_inbox\s*\(([\s\S]*?)\);/i
  );
  if (!tableMatch) {
    throw new Error("webhook_inbox CREATE TABLE 블록을 찾을 수 없습니다.");
  }

  const tableBlock = tableMatch[1];

  // product_scope CHECK constraint 값 추출
  const checkMatch = tableBlock.match(
    /check\s*\(\s*product_scope\s+in\s*\(([^)]+)\)/i
  );
  const productScopeValues: string[] = checkMatch
    ? checkMatch[1]
        .split(",")
        .map((v) => v.trim().replace(/'/g, ""))
    : ["habix_course", "pmf_radar_lab", "other"];

  // 컬럼 정의 줄 파싱
  // 패턴: <name> <type> [primary key] [not null] [default <expr>] [constraint ...]
  const lines = tableBlock
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const columns: ColumnDef[] = [];
  const COLUMN_RE = /^(\w+)\s+([\w]+(?:tz)?)\s*(.*)/i;

  // CONSTRAINT, UNIQUE 등 테이블 수준 제약은 컬럼 정의가 아님
  const TABLE_LEVEL_RE = /^(constraint|unique|primary|check)\b/i;

  for (const line of lines) {
    // 줄 주석 제거
    const stripped = line.replace(/--.*$/, "").trim();
    if (!stripped || TABLE_LEVEL_RE.test(stripped)) continue;

    const m = COLUMN_RE.exec(stripped);
    if (!m) continue;

    const colName = m[1].toLowerCase();
    const colType = m[2].toLowerCase().replace(/tz$/, "tz"); // timestamptz 보존
    const rest = m[3].toLowerCase();

    // primary key 컬럼 → 항상 hasDefault=true (gen_random_uuid)
    const isPk = rest.includes("primary key");
    const notNull = rest.includes("not null") || isPk;
    const hasDefault = rest.includes("default") || isPk;

    columns.push({ name: colName, type: colType, notNull, hasDefault });
  }

  if (columns.length === 0) {
    throw new Error("webhook_inbox 컬럼 파싱 결과 0개 — SQL 파서 점검 필요");
  }

  // NOT NULL이면서 default 없는 컬럼 = INSERT 시 반드시 포함
  const requiredForInsert = columns
    .filter((c) => c.notNull && !c.hasDefault)
    .map((c) => c.name);

  return {
    columns,
    requiredForInsert,
    productScopeValues,
    uniquePair: ["source", "message_id"],
  };
}

/** 파싱된 스키마에서 컬럼 이름 Set 반환 (화이트리스트 검증용) */
export function columnNameSet(schema: WebhookInboxSchema): Set<string> {
  return new Set(schema.columns.map((c) => c.name));
}
