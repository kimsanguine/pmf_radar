import React from 'react';
import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const C = {
  bg: '#faf8f4',
  paper: '#f3f0ea',
  dark: '#0a0a14',
  navy: '#1a1a2e',
  ink: '#3d3830',
  muted: '#7a7068',
  line: '#e8e3d8',
  accent: '#c8623a',
  accent2: '#d9744f',
  green: '#4caf82',
  yellow: '#d6a238',
  red: '#c85a3a',
};

const fps = 30;

const inquiryCards = [
  {source: 'KAKAO', text: '설치 없이 먼저 체험할 수 있나요?', color: '#f2c94c'},
  {source: 'CHANNEL', text: '개인정보 익명화 기준이 필요합니다.', color: C.green},
  {source: 'OPENCHAT', text: '좋은 결과와 나쁜 결과 기준이 궁금해요.', color: C.yellow},
  {source: 'CSV', text: '반복 문의를 우선순위로 보고 싶어요.', color: C.accent2},
];

const evidenceRows = [
  ['Intent', '체험 전환'],
  ['Risk', '개인정보'],
  ['Pain', '품질 기준'],
  ['Signal', '반복 문의'],
];

const routeCards = [
  {title: '답변 초안', body: '가벼운 FAQ는 운영자 확인 전 초안', color: C.green, start: 188},
  {title: 'HITL 검토', body: '개인정보/환불은 사람 심사', color: C.yellow, start: 208},
];

const fade = (frame: number, start: number, duration = 18) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

const slide = (frame: number, start: number, from: number, to = 0) =>
  interpolate(frame, [start, start + 20], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

const Box: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  start: number;
  children: React.ReactNode;
  dark?: boolean;
}> = ({x, y, w, h, start, children, dark}) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + slide(frame, start, 18),
        width: w,
        height: h,
        opacity: fade(frame, start),
        border: dark ? '1px solid rgba(250,248,244,.14)' : `1px solid ${C.line}`,
        borderRadius: 8,
        background: dark ? C.navy : C.paper,
        overflow: 'hidden',
      }}
    >
      {children}
    </div>
  );
};

const Header = () => {
  const frame = useCurrentFrame();
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 52,
          top: 38,
          opacity: fade(frame, 0),
          fontFamily: 'monospace',
          color: C.accent,
          fontSize: 17,
          fontWeight: 900,
          letterSpacing: 5,
        }}
      >
        HABIX<span style={{color: C.dark}}>.AI</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 52,
          top: 78,
          width: 620,
          opacity: fade(frame, 6),
          transform: `translateY(${slide(frame, 6, 16)}px)`,
          color: C.dark,
          fontSize: 43,
          lineHeight: 1.12,
          fontWeight: 950,
        }}
      >
        문의가 쌓이면
        <br />
        hplan이 개선 후보를 찾습니다.
      </div>
      <div
        style={{
          position: 'absolute',
          right: 54,
          top: 54,
          width: 300,
          padding: '15px 18px',
          opacity: fade(frame, 16),
          border: `1px solid ${C.line}`,
          borderRadius: 8,
          color: C.muted,
          background: C.paper,
          fontFamily: 'monospace',
          fontSize: 13,
          fontWeight: 800,
          lineHeight: 1.55,
        }}
      >
        문의 → 증거 → 검토 → 개선안
      </div>
    </>
  );
};

const InquiryStack = () => {
  const frame = useCurrentFrame();
  return (
    <Box x={54} y={210} w={310} h={360} start={24}>
      <div style={{padding: '17px 20px', borderBottom: `1px solid ${C.line}`, fontFamily: 'monospace', fontSize: 13, fontWeight: 900, color: C.navy}}>
        01 / 문의 입력
      </div>
      <div style={{padding: 16, display: 'grid', gap: 10}}>
        {inquiryCards.map((item, index) => {
          const start = 42 + index * 18;
          return (
            <div
              key={item.source}
              style={{
                opacity: fade(frame, start),
                transform: `translateX(${slide(frame, start, -34)}px)`,
                minHeight: 62,
                padding: '12px 13px',
                border: `1px solid ${C.line}`,
                borderRadius: 7,
                background: '#fffdf9',
              }}
            >
              <div style={{fontFamily: 'monospace', color: item.color === '#f2c94c' ? '#7a5a00' : item.color, fontSize: 11, fontWeight: 900}}>
                {item.source}
              </div>
              <div style={{marginTop: 5, color: C.ink, fontSize: 16, fontWeight: 800, lineHeight: 1.35}}>
                {item.text}
              </div>
            </div>
          );
        })}
      </div>
    </Box>
  );
};

const HplanEngine = () => {
  const frame = useCurrentFrame();
  const pulse = spring({frame: frame - 105, fps, config: {damping: 10, stiffness: 80}});
  const glow = interpolate(pulse, [0, 1], [0.15, 0.55], {extrapolateRight: 'clamp'});
  const nodes = [
    {label: '구매', x: 60, y: 118, start: 112},
    {label: '보안', x: 232, y: 118, start: 124},
    {label: '실습', x: 60, y: 220, start: 136},
    {label: '품질', x: 232, y: 220, start: 148},
  ];
  return (
    <Box x={404} y={210} w={330} h={360} start={88} dark>
      <div style={{padding: '18px 22px', borderBottom: '1px solid rgba(250,248,244,.14)', fontFamily: 'monospace', fontSize: 13, fontWeight: 900, color: C.accent2}}>
        02-04 / hplan intent classifier
      </div>
      <div style={{position: 'absolute', inset: 0, background: `radial-gradient(circle at 50% 44%, rgba(200,98,58,${glow}), transparent 45%)`}} />
      <svg width="330" height="300" style={{position: 'absolute', left: 0, top: 54}}>
        {nodes.map((node) => {
          const o = fade(frame, node.start, 14);
          return (
            <g key={node.label} opacity={o}>
              <path d={`M165 132 C165 132 ${node.x} ${node.y} ${node.x} ${node.y}`} stroke="rgba(217,116,79,.66)" strokeWidth="3" fill="none" strokeDasharray="7 8" />
              <circle cx={node.x} cy={node.y} r="32" fill="rgba(250,248,244,.08)" stroke="rgba(250,248,244,.22)" />
              <text x={node.x} y={node.y + 6} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900">{node.label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{position: 'absolute', left: 105, top: 143, width: 120, height: 120, border: `1px solid rgba(250,248,244,.22)`, borderRadius: '50%', display: 'grid', placeItems: 'center', textAlign: 'center'}}>
        <div style={{color: '#fff', fontSize: 25, lineHeight: 1.04, fontWeight: 950}}>
          hplan
          <br />
          intent
        </div>
      </div>
      <div style={{position: 'absolute', left: 45, bottom: 28, width: 240, textAlign: 'center', color: 'rgba(250,248,244,.72)', fontSize: 15, lineHeight: 1.45, fontWeight: 700}}>
        의도 파악 후 evidence로 변환
      </div>
    </Box>
  );
};

const EvidencePanel = () => {
  const frame = useCurrentFrame();
  return (
    <Box x={774} y={210} w={220} h={360} start={126}>
      <div style={{padding: '17px 18px', borderBottom: `1px solid ${C.line}`, fontFamily: 'monospace', fontSize: 13, fontWeight: 900, color: C.navy}}>
        04 / Radar 근거 정리
      </div>
      <div style={{padding: 15, display: 'grid', gap: 11}}>
        {evidenceRows.map((row, index) => (
          <div
            key={row[0]}
            style={{
              opacity: fade(frame, 136 + index * 12),
              transform: `translateY(${slide(frame, 136 + index * 12, 14)}px)`,
              padding: 12,
              background: '#fffdf9',
              border: `1px solid ${C.line}`,
              borderRadius: 6,
            }}
          >
            <div style={{fontFamily: 'monospace', color: C.accent, fontSize: 11, fontWeight: 900}}>{row[0]}</div>
            <div style={{marginTop: 4, color: C.dark, fontSize: 14, fontWeight: 800, lineHeight: 1.3}}>{row[1]}</div>
          </div>
        ))}
      </div>
    </Box>
  );
};

const RoutePanel = () => {
  const frame = useCurrentFrame();
  return (
    <Box x={1030} y={210} w={198} h={360} start={166}>
      <div style={{padding: '17px 16px', borderBottom: `1px solid ${C.line}`, fontFamily: 'monospace', fontSize: 13, fontWeight: 900, color: C.navy}}>
        05 / 답변 · HITL
      </div>
      <div style={{padding: 14, display: 'grid', gap: 11}}>
        {routeCards.map((item) => (
          <div
            key={item.title}
            style={{
              opacity: fade(frame, item.start),
              transform: `translateX(${slide(frame, item.start, 22)}px)`,
              padding: 12,
              minHeight: 104,
              borderLeft: `4px solid ${item.color}`,
              background: '#fffdf9',
              borderRadius: 6,
            }}
          >
            <div style={{color: C.dark, fontSize: 17, fontWeight: 900, lineHeight: 1.25}}>{item.title}</div>
            <div style={{marginTop: 8, color: C.muted, fontSize: 13, fontWeight: 700, lineHeight: 1.38}}>{item.body}</div>
          </div>
        ))}
      </div>
    </Box>
  );
};

const RadarStrip = () => {
  const frame = useCurrentFrame();
  const bubbles = [
    {x: 594, y: 620, r: 38, c: C.red, label: 'Build'},
    {x: 706, y: 620, r: 31, c: C.yellow, label: 'Interview'},
    {x: 806, y: 620, r: 28, c: C.green, label: 'Guardrail'},
  ];
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 54,
          right: 54,
          bottom: 42,
          height: 90,
          opacity: fade(frame, 230),
          border: `1px solid ${C.line}`,
          borderRadius: 8,
          background: C.paper,
          overflow: 'hidden',
        }}
      >
        <div style={{position: 'absolute', left: 22, top: 22, color: C.dark, fontSize: 19, fontWeight: 950}}>
          06 / Backlog 적재 → 다음 문의로 루프
        </div>
        <div style={{position: 'absolute', left: 22, top: 52, color: C.muted, fontSize: 15, fontWeight: 700}}>
          반복성 · 위험도 · 증거강도 → FAQ, 강의자료, 제품 실험
        </div>
        {bubbles.map((b, index) => (
          <div
            key={b.label}
            style={{
              position: 'absolute',
              left: b.x,
              top: b.y - 585,
              width: b.r * 2,
              height: b.r * 2,
              opacity: fade(frame, 242 + index * 10),
              borderRadius: '50%',
              background: b.c,
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontFamily: 'monospace',
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            {b.label}
          </div>
        ))}
      </div>
      <svg width="1280" height="720" style={{position: 'absolute', inset: 0, opacity: fade(frame, 252)}}>
        <path d="M1118 594 C1118 670 184 674 184 590" fill="none" stroke={C.accent} strokeWidth="5" strokeLinecap="round" strokeDasharray="12 14" />
        <path d="M166 590 L184 568 L202 590" fill="none" stroke={C.accent} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </>
  );
};

const FinalOverlay = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const opacity = interpolate(frame, [durationInFrames - 46, durationInFrames - 12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: opacity > 0 ? 'grid' : 'none',
        placeItems: 'center',
        background: `rgba(10,10,20,${opacity * 0.94})`,
        color: '#fff',
      }}
    >
      <div style={{width: 900, textAlign: 'center', opacity}}>
        <div style={{fontFamily: 'monospace', color: C.accent2, fontSize: 20, fontWeight: 900, letterSpacing: 4}}>
          HPLAN LOOP
        </div>
        <div style={{marginTop: 22, fontSize: 58, lineHeight: 1.1, fontWeight: 950}}>
          문의함이 제품 판단 근거가 됩니다.
        </div>
        <div style={{marginTop: 20, color: 'rgba(255,255,255,.72)', fontSize: 23, lineHeight: 1.45, fontWeight: 700}}>
          자동답변보다 먼저, 반복 불편을 개선 후보로 연결합니다.
        </div>
      </div>
    </div>
  );
};

export const HplanPmfDemo = () => {
  return (
    <AbsoluteFill style={{background: C.bg, fontFamily: 'Noto Sans KR, Apple SD Gothic Neo, sans-serif'}}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(90deg, rgba(61,56,48,.055) 1px, transparent 1px), linear-gradient(180deg, rgba(61,56,48,.045) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }}
      />
      <Header />
      <InquiryStack />
      <HplanEngine />
      <EvidencePanel />
      <RoutePanel />
      <RadarStrip />
      <FinalOverlay />
    </AbsoluteFill>
  );
};
