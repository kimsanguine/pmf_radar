import React from 'react';
import { AbsoluteFill } from 'remotion';

// V2 HITL 검토 데모 — Phase 2 V2 agent 가 채울 placeholder
// 시나리오: inq-029 (privacy/B2B) 카톡 → 분류 → Gate 차단 → Telegram 알림 → 운영자 수동 답변
// 사용 컴포넌트: KakaoFrame, RadarBadge, GateBlock (V2 전용), TelegramFrame

export const HitlDemo: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: '#FAF8F4',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        color: '#1A1A1A',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ textAlign: 'center', opacity: 0.4 }}>
        <div style={{ fontSize: 20, fontFamily: 'monospace', letterSpacing: 2 }}>
          hitl-demo
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: '#888888' }}>
          Phase 2 V2 agent 가 채울 영역
        </div>
      </div>
    </AbsoluteFill>
  );
};
