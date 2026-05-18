import React from 'react';

// ─── 타입 ───────────────────────────────────────────────────────────────────

export type BacklogCardProps = {
  clusterName: string;
  decision: string;       // hplan decision 항목
  push: string;           // push 동력 (PMF 근거)
  anxiety: string;        // anxiety (리스크/불안 요소)
  priority: 1 | 2 | 3 | 4 | 5;
  color: string;          // cluster 대표 색상
  fadeIn: number;         // 0~1 opacity
};

// ─── 우선순위 레이블 ───────────────────────────────────────────────────────

const PRIORITY_LABEL: Record<number, string> = {
  1: 'P1 — 즉시',
  2: 'P2 — 이번 스프린트',
  3: 'P3 — 다음 분기',
  4: 'P4 — 보류',
  5: 'P5 — 아이디어',
};

const PRIORITY_BG: Record<number, string> = {
  1: '#C8623A',
  2: '#E0A445',
  3: '#2D8A4F',
  4: '#5A5A7A',
  5: '#8A8A9A',
};

// ─── BacklogCard ──────────────────────────────────────────────────────────

export const BacklogCard: React.FC<BacklogCardProps> = ({
  clusterName,
  decision,
  push,
  anxiety,
  priority,
  color,
  fadeIn,
}) => {
  return (
    <div
      style={{
        opacity: fadeIn,
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 6px 24px rgba(0,0,0,0.12)',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        background: '#FFFFFF',
        borderLeft: `6px solid ${color}`,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: color + '12',
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${color}20`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {/* 우선순위 배지 */}
          <div
            style={{
              background: PRIORITY_BG[priority],
              borderRadius: 6,
              padding: '3px 8px',
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 800,
              letterSpacing: 0.3,
            }}
          >
            {PRIORITY_LABEL[priority]}
          </div>
          <span style={{ color: color, fontSize: 16, fontWeight: 900 }}>
            {clusterName}
          </span>
        </div>
        {/* hplan 라벨 */}
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 11,
            fontWeight: 700,
            color: '#888888',
            letterSpacing: 1,
          }}
        >
          hplan backlog
        </span>
      </div>

      {/* 내용 */}
      <div style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>
        {/* Decision */}
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 800,
              color: color,
              letterSpacing: 0.8,
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Decision
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.4 }}>
            {decision}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {/* Push */}
          <div
            style={{
              background: '#F0FFF4',
              borderRadius: 8,
              padding: '10px 12px',
              borderLeft: '3px solid #2D8A4F',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#2D8A4F',
                letterSpacing: 0.8,
                marginBottom: 4,
              }}
            >
              PUSH
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1A4A2A', lineHeight: 1.35 }}>
              {push}
            </div>
          </div>

          {/* Anxiety */}
          <div
            style={{
              background: '#FFF5F0',
              borderRadius: 8,
              padding: '10px 12px',
              borderLeft: '3px solid #C8623A',
            }}
          >
            <div
              style={{
                fontSize: 10,
                fontWeight: 800,
                color: '#C8623A',
                letterSpacing: 0.8,
                marginBottom: 4,
              }}
            >
              ANXIETY
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#4A1A0A', lineHeight: 1.35 }}>
              {anxiety}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
