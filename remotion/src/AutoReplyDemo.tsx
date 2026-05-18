import React from 'react';
import { AbsoluteFill } from 'remotion';

// V1 자동 응답 데모 — Phase 2 V1 agent 가 채울 placeholder
// 시나리오: inq-001 (setup) 카톡 → 분류 → Auto-Reply Gate 5조건 통과 → 답변 발송 → outro
// 사용 컴포넌트: KakaoFrame, RadarBadge, AutoReplyGate (V1 전용), Outro

export const AutoReplyDemo: React.FC = () => {
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
          auto-reply-demo
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: '#888888' }}>
          Phase 2 V1 agent 가 채울 영역
        </div>
      </div>
    </AbsoluteFill>
  );
};
