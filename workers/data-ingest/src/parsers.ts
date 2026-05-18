/**
 * CSV / XLSX 파일 파싱.
 *
 * 출력: 헤더 = key, 행 = value 인 Record 배열.
 * 빈 행 / 헤더 미스매치는 자체 skip.
 */

import * as XLSX from "xlsx";

export type ParsedRow = Record<string, string>;

const REQUIRED_TEXT_COLUMNS = ["message", "내용", "문의", "content", "body", "text"];

export function parseCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length === 0) continue;

    const row: ParsedRow = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] ?? "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

export function parseXlsx(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];

  const sheet = workbook.Sheets[firstSheet];
  const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false
  });

  return jsonRows.map((row) => {
    const normalized: ParsedRow = {};
    for (const key of Object.keys(row)) {
      const value = row[key];
      normalized[key.trim().toLowerCase()] = String(value ?? "").trim();
    }
    return normalized;
  });
}

/**
 * 파싱된 row 에서 핵심 텍스트 필드를 추출.
 * 다국어 헤더(한/영) 모두 대응.
 */
export function extractMessageText(row: ParsedRow): string {
  for (const col of REQUIRED_TEXT_COLUMNS) {
    if (row[col] && row[col].length > 0) return row[col];
  }
  // fallback: 모든 값 concat (헤더 매칭 실패 시)
  return Object.values(row).filter((v) => v.length > 0).join(" | ");
}
