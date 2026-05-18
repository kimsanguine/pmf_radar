import React from 'react';
import { AbsoluteFill } from 'remotion';

// V3 데이터 → hplan 데모 — Phase 2 V3 agent 가 채울 placeholder
// 시나리오: 5~7 카톡 burst → BubbleMap 형성 → cluster drilldown → BacklogCard + 그래프
// 사용 컴포넌트: KakaoFrame (multi), BubbleMap, BacklogCard, RiskGraph

export const DataToHplanDemo: React.FC = () => {
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
          data-to-hplan-demo
        </div>
        <div style={{ marginTop: 8, fontSize: 14, color: '#888888' }}>
          Phase 2 V3 agent 가 채울 영역
        </div>
      </div>
    </AbsoluteFill>
  );
};
