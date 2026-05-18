import React from 'react';

// ─── 타입 ───────────────────────────────────────────────────────────────────

export type RadarBadgeProps = {
  category: string;           // "setup" | "privacy" 등
  categoryLabel: string;      // "설치 실패" | "개인정보"
  strength: 'strong' | 'medium' | 'weak';
  color: string;              // "#C8623A" | "#2D8A4F" | "#E0A445"
  decisionType: 'build' | 'interview' | 'guardrail';
  source: string;             // "mock_kakao" | "mock_channel_talk"
  fadeIn: number;             // 0~1 opacity
};

// ─── 레이블 매핑 ───────────────────────────────────────────────────────────

const STRENGTH_LABEL: Record<RadarBadgeProps['strength'], string> = {
  strong: '강한 신호',
  medium: '보통 신호',
  weak:   '약한 신호',
};

const DECISION_LABEL: Record<RadarBadgeProps['decisionType'], string> = {
  build:      '빌드 신호',
  interview:  '인터뷰 필요',
  guardrail:  '가드레일',
};

const DECISION_ICON: Record<RadarBadgeProps['decisionType'], string> = {
  build:     '🔨',
  interview: '💬',
  guardrail: '🛡',
};

const SOURCE_LABEL: Record<string, string> = {
  mock_kakao:         '카카오톡',
  mock_channel_talk:  'Channel Talk',
};

// ─── RadarBadge ────────────────────────────────────────────────────────────

export const RadarBadge: React.FC<RadarBadgeProps> = ({
  category,
  categoryLabel,
  strength,
  color,
  decisionType,
  source,
  fadeIn,
}) => {
  const sourceLabel = SOURCE_LABEL[source] ?? source;

  return (
    <div
      style={{
        opacity: fadeIn,
        width: '100%',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        border: `2px solid ${color}`,
        background: '#FAFAFA',
      }}
    >
      {/* 상단 컬러 바 */}
      <div
        style={{
          background: color,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{DECISION_ICON[decisionType]}</span>
          <div>
            <div style={{ color: '#FFFFFF', fontSize: 11, fontWeight: 700, opacity: 0.85, letterSpacing: 1 }}>
              PMF RADAR
            </div>
            <div style={{ color: '#FFFFFF', fontSize: 16, fontWeight: 900, lineHeight: 1.2 }}>
              {categoryLabel}
            </div>
          </div>
        </div>
        <div
          style={{
            background: 'rgba(255,255,255,0.25)',
            borderRadius: 20,
            padding: '4px 10px',
            color: '#FFFFFF',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          {sourceLabel}
        </div>
      </div>

      {/* 하단 메타 영역 */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* 카테고리 코드 */}
        <div
          style={{
            border: `1px solid ${color}`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 800,
            color: color,
            fontFamily: 'monospace',
          }}
        >
          {category}
        </div>

        {/* 신호 강도 */}
        <div
          style={{
            background: '#F5F5F5',
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
            color: '#555555',
          }}
        >
          {STRENGTH_LABEL[strength]}
        </div>

        {/* 결정 유형 */}
        <div
          style={{
            background: color + '18',
            border: `1px solid ${color}40`,
            borderRadius: 6,
            padding: '3px 8px',
            fontSize: 11,
            fontWeight: 700,
            color: color,
          }}
        >
          {DECISION_LABEL[decisionType]}
        </div>
      </div>
    </div>
  );
};
