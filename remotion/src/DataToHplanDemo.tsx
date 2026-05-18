/**
 * DataToHplanDemo.tsx — V3: 데이터 → hplan 데모
 * minimal big-text redesign (R11)
 *
 * 5 scenes × 6s = 30s (900 frames @30fps)
 * 1920×1080, 배경 #0a0a14
 *
 * Scene 1 (0~240):   6 카톡 메시지 빠른 컷 (각 ~40f, 가운데 한 줄씩)
 * Scene 2 (240~480): "6 CS → 5 CLUSTER" + 단순 bubble circle 5개
 * Scene 3 (480~720): "가장 큰 cluster: 설치 실패 (2건)" 빨간색 강조
 * Scene 4 (720~900): "hplan 백로그 ↑ 개선 후보 자동 추가"
 */

import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

// ── 팔레트 ─────────────────────────────────────────────────────────────────
const BG    = '#0a0a14';
const RED   = '#a6492a';
const GREEN = '#2D8A4F';
const GOLD  = '#D6A238';
const WHITE = '#F5F3EE';
const MUTED = 'rgba(245,243,238,0.45)';

// ── 타이포그래피 ────────────────────────────────────────────────────────────
const SERIF = '"DM Serif Display", "Noto Serif KR", Georgia, serif';
const MONO  = '"JetBrains Mono", "Noto Sans KR", monospace';
const SANS  = '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif';

// ── 유틸 ──────────────────────────────────────────────────────────────────
function fadeIn(frame: number, start: number, dur = 18) {
  return interpolate(frame, [start, start + dur], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function fadeOut(frame: number, end: number, dur = 18) {
  return interpolate(frame, [end - dur, end], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function sceneOp(frame: number, s: number, e: number) {
  return Math.min(fadeIn(frame, s), fadeOut(frame, e));
}

// ── 자막 ──────────────────────────────────────────────────────────────────
const Caption: React.FC<{ text: string; op: number }> = ({ text, op }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 60,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      opacity: op,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        background: 'rgba(10,10,20,0.78)',
        border: '1px solid rgba(245,243,238,0.12)',
        borderRadius: 8,
        padding: '14px 44px',
        fontFamily: SANS,
        fontSize: 38,
        fontWeight: 600,
        color: WHITE,
        letterSpacing: 0.3,
        backdropFilter: 'blur(6px)',
      }}
    >
      {text}
    </div>
  </div>
);

// ── Fixture ────────────────────────────────────────────────────────────────
const MESSAGES = [
  { text: 'zsh: command not found 떠서 막혀있어요',         channel: 'Kakao',       color: RED   },
  { text: 'AGENTS.md 왜 중요한지 감은 오는데 막막해요',     channel: 'Kakao',       color: RED   },
  { text: '사내 데이터 보안 정책 확인 필요합니다',           channel: 'Channel Talk', color: GREEN },
  { text: '업무별 starter kit 가 있으면 재수강할 듯해요',   channel: 'Kakao',       color: GOLD  },
  { text: 'npm install 에러가 났는데 제 문제인지...',        channel: 'Kakao',       color: RED   },
  { text: '팀원 5명에게 들려주고 싶은데 템플릿이 있나요?',  channel: 'Channel Talk', color: RED   },
];

// 각 메시지 표시 구간: 40프레임 간격
const MSG_INTERVAL = 40;

// ── Bubble 데이터 (Scene 2) ────────────────────────────────────────────────
// 5 cluster — 색만으로 구분, 텍스트 없음 (minimal)
// 위치: 1920×1080 기준 중심 좌표
const BUBBLES = [
  { cx: 480,  cy: 480, r: 160, color: RED,   label: '설치 실패',    count: 2, isMain: true  },
  { cx: 820,  cy: 340, r: 110, color: RED,   label: 'PM 사고',      count: 1, isMain: false },
  { cx: 1100, cy: 520, r: 90,  color: GREEN, label: '개인정보',     count: 1, isMain: false },
  { cx: 1320, cy: 350, r: 90,  color: GOLD,  label: '재방문 의향',  count: 1, isMain: false },
  { cx: 700,  cy: 660, r: 90,  color: RED,   label: '품질 판단',   count: 1, isMain: false },
];

// ══════════════════════════════════════════════════════════════════════════
// Scene 1 (0~240): 6 카톡 메시지 빠른 컷
// ══════════════════════════════════════════════════════════════════════════
const Scene1: React.FC<{ frame: number }> = ({ frame }) => {
  const op = sceneOp(frame, 0, 240);

  // 현재 활성 메시지 인덱스
  const msgIdx = Math.min(MESSAGES.length - 1, Math.floor(frame / MSG_INTERVAL));
  const msg = MESSAGES[msgIdx];

  // 메시지 내부 fade — 각 메시지 첫 10f fade-in
  const localF  = frame % MSG_INTERVAL;
  const msgOp   = interpolate(localF, [0, 10], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const msgY    = interpolate(localF, [0, 12], [16, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // 카운터
  const countNum = msgIdx + 1;

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* 카운터 */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 200,
          fontWeight: 900,
          color: `${msg.color}18`,
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          lineHeight: 1,
          userSelect: 'none',
          pointerEvents: 'none',
          letterSpacing: -8,
        }}
      >
        {countNum}
      </div>

      {/* 채널 라벨 */}
      <div
        style={{
          fontFamily: MONO,
          fontSize: 32,
          fontWeight: 700,
          color: msg.color,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 24,
          opacity: msgOp,
        }}
      >
        {msg.channel}
      </div>

      {/* 메시지 텍스트 */}
      <div
        style={{
          opacity: msgOp,
          transform: `translateY(${msgY}px)`,
          fontFamily: SANS,
          fontSize: 80,
          fontWeight: 600,
          color: WHITE,
          textAlign: 'center',
          lineHeight: 1.4,
          letterSpacing: -0.5,
          maxWidth: 1400,
          padding: '0 80px',
        }}
      >
        {msg.text}
      </div>

      {/* 진행 점 */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          marginTop: 56,
        }}
      >
        {MESSAGES.map((_, i) => (
          <div
            key={i}
            style={{
              width: i === msgIdx ? 32 : 10,
              height: 10,
              borderRadius: 5,
              background: i === msgIdx ? MESSAGES[i].color : 'rgba(245,243,238,0.2)',
              transition: 'width 0.1s',
            }}
          />
        ))}
      </div>

      <Caption text="다양한 채널에서 CS 문의 도착 (6건 / 8초)" op={sceneOp(frame, 10, 230)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 2 (240~480): "6 CS → 5 CLUSTER" + bubble 5개
// bubble에 텍스트 없음 — 색과 크기만으로 클러스터 표현
// ══════════════════════════════════════════════════════════════════════════
const Scene2: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 240, 480);
  const lf = frame - 240;

  const titleOp = fadeIn(lf, 10, 20);
  const arrowOp = fadeIn(lf, 35, 20);

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* 상단 수식 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          opacity: titleOp,
          marginBottom: 60,
        }}
      >
        <div style={{ fontFamily: SERIF, fontSize: 128, fontWeight: 400, color: WHITE, letterSpacing: -2, lineHeight: 1 }}>
          6 CS
        </div>
        <div style={{ fontFamily: SANS, fontSize: 80, fontWeight: 400, color: MUTED, lineHeight: 1 }}>
          →
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 128, fontWeight: 400, color: RED, letterSpacing: -2, lineHeight: 1 }}>
          5 CLUSTER
        </div>
      </div>

      {/* Bubble 시각화 — SVG, 텍스트 없음 */}
      <div
        style={{
          opacity: arrowOp,
          width: 1100,
          height: 380,
          position: 'relative',
        }}
      >
        <svg
          width="1100"
          height="380"
          viewBox="0 0 1100 380"
          style={{ overflow: 'visible' }}
        >
          {BUBBLES.map((b, i) => {
            const bScale = spring({
              frame: lf - (35 + i * 12),
              fps,
              config: { damping: 20, stiffness: 150 },
            });
            // SVG 좌표 재매핑 (1920→1100, 1080→380 — y 중심 기준)
            const sx = (b.cx / 1920) * 1100;
            const sy = ((b.cy - 340) / 400) * 380 + 190;
            const sr = (b.r / 1920) * 1100;

            return (
              <g key={i}>
                <circle
                  cx={sx}
                  cy={sy}
                  r={sr * bScale}
                  fill={b.color}
                  opacity={b.isMain ? 0.9 : 0.55}
                />
                {/* 주요 클러스터에 작은 카운트 뱃지 */}
                {b.isMain && (
                  <text
                    x={sx}
                    y={sy + 8}
                    textAnchor="middle"
                    fontSize={sr * 0.6}
                    fontWeight="900"
                    fill="white"
                    fontFamily="JetBrains Mono, monospace"
                    opacity={bScale}
                  >
                    {b.count}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* 범례 */}
      <div
        style={{
          opacity: fadeIn(lf, 110, 25),
          display: 'flex',
          gap: 36,
          marginTop: 24,
        }}
      >
        {[
          { color: RED,   label: 'Build 필요' },
          { color: GREEN, label: 'Guardrail'  },
          { color: GOLD,  label: 'Interview'  },
        ].map(({ color, label }) => (
          <div
            key={label}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: SANS,
                fontSize: 36,
                fontWeight: 600,
                color: MUTED,
              }}
            >
              {label}
            </span>
          </div>
        ))}
      </div>

      <Caption text="PMF Radar 가 카테고리별 cluster 자동 형성" op={sceneOp(frame, 255, 465)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 3 (480~720): 가장 큰 cluster — 설치 실패 (2건)
// ══════════════════════════════════════════════════════════════════════════
const Scene3: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 480, 720);
  const lf = frame - 480;

  const labelOp = fadeIn(lf, 10, 18);

  const bigScale = spring({
    frame: lf - 20,
    fps,
    config: { damping: 22, stiffness: 150 },
  });
  const bigOp  = fadeIn(lf, 20, 22);
  const sub1Op = fadeIn(lf, 55, 22);
  const sub2Op = fadeIn(lf, 80, 22);
  const dotOp  = fadeIn(lf, 100, 25);

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* 라벨 */}
      <div
        style={{
          opacity: labelOp,
          fontFamily: MONO,
          fontSize: 36,
          fontWeight: 700,
          color: MUTED,
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 24,
        }}
      >
        가장 큰 cluster
      </div>

      {/* 메인 클러스터명 */}
      <div
        style={{
          opacity: bigOp,
          transform: `scale(${bigScale})`,
          fontFamily: SERIF,
          fontSize: 160,
          fontWeight: 400,
          color: RED,
          lineHeight: 1,
          letterSpacing: -3,
          textAlign: 'center',
        }}
      >
        설치 실패
      </div>

      {/* 카운트 */}
      <div
        style={{
          opacity: sub1Op,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          marginTop: 32,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 100,
            fontWeight: 900,
            color: RED,
            lineHeight: 1,
          }}
        >
          2건
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 56,
            fontWeight: 500,
            color: MUTED,
          }}
        >
          · strong signal
        </div>
      </div>

      <div style={{ height: 48 }} />

      {/* 왜 중요한지 — 한 줄 */}
      <div
        style={{
          opacity: sub2Op,
          fontFamily: SANS,
          fontSize: 48,
          fontWeight: 400,
          color: MUTED,
          textAlign: 'center',
          lineHeight: 1.6,
          maxWidth: 960,
        }}
      >
        첫 설치 환경 차이 → 강의 시작 전 이탈 발생
      </div>

      {/* 결정 */}
      <div
        style={{
          opacity: dotOp,
          marginTop: 40,
          background: `${RED}18`,
          border: `1px solid ${RED}44`,
          borderRadius: 12,
          padding: '20px 48px',
          fontFamily: MONO,
          fontSize: 40,
          fontWeight: 700,
          color: RED,
          letterSpacing: 0.5,
          textAlign: 'center',
        }}
      >
        → OS별 복구 체크포인트 + 에러북 선행 제작
      </div>

      <Caption text="가장 큰 cluster: 설치 실패 (2건, strong)" op={sceneOp(frame, 495, 705)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 4 (720~900): hplan 백로그 ↑ 개선 후보 자동 추가
// ══════════════════════════════════════════════════════════════════════════
const Scene4: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 720, 900);
  const lf = frame - 720;

  const lineScale = spring({
    frame: lf - 8,
    fps,
    config: { damping: 28, stiffness: 110 },
  });
  const topOp = fadeIn(lf, 20, 25);
  const topY  = interpolate(lf, [20, 45], [28, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const botOp = fadeIn(lf, 55, 25);
  const botY  = interpolate(lf, [55, 80], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOp  = fadeIn(lf, 85, 25);
  const tagOp   = fadeIn(lf, 120, 25);

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0,
      }}
    >
      {/* 구분선 */}
      <div
        style={{
          width: `${lineScale * 200}px`,
          height: 3,
          background: GOLD,
          borderRadius: 2,
          marginBottom: 56,
        }}
      />

      <div
        style={{
          opacity: topOp,
          transform: `translateY(${topY}px)`,
          fontFamily: SERIF,
          fontSize: 120,
          fontWeight: 400,
          color: WHITE,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}
      >
        hplan 백로그 ↑
      </div>

      <div
        style={{
          opacity: botOp,
          transform: `translateY(${botY}px)`,
          fontFamily: SERIF,
          fontSize: 120,
          fontWeight: 400,
          color: GOLD,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}
      >
        개선 후보 자동 추가
      </div>

      <div style={{ height: 56 }} />

      {/* 백로그 카드 미니 */}
      <div
        style={{
          opacity: cardOp,
          background: '#111118',
          border: `1px solid ${GOLD}40`,
          borderRadius: 18,
          padding: '32px 56px',
          maxWidth: 960,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span
            style={{
              fontFamily: SANS,
              fontSize: 44,
              fontWeight: 700,
              color: WHITE,
            }}
          >
            설치 실패
          </span>
          <span
            style={{
              background: RED,
              borderRadius: 8,
              padding: '6px 20px',
              fontFamily: MONO,
              fontSize: 36,
              fontWeight: 900,
              color: WHITE,
            }}
          >
            P5 Critical
          </span>
        </div>
        <div
          style={{
            fontFamily: SANS,
            fontSize: 38,
            color: MUTED,
            lineHeight: 1.5,
          }}
        >
          OS별 복구 체크포인트와 에러북을 먼저 만든다
        </div>
        <div
          style={{
            display: 'flex',
            gap: 14,
            marginTop: 4,
          }}
        >
          {['setup', 'strong', 'build', '2건'].map((tag) => (
            <span
              key={tag}
              style={{
                background: 'rgba(245,243,238,0.08)',
                borderRadius: 6,
                padding: '4px 16px',
                fontFamily: MONO,
                fontSize: 30,
                fontWeight: 700,
                color: MUTED,
                letterSpacing: 0.5,
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div style={{ height: 40 }} />

      <div
        style={{
          opacity: tagOp,
          fontFamily: MONO,
          fontSize: 36,
          fontWeight: 700,
          color: MUTED,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        hplan · PMF Signal Radar
      </div>

      <Caption text="hplan 백로그에 개선 후보 자동 추가 + priority 분포" op={sceneOp(frame, 735, 885)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// DataToHplanDemo — 메인
// ══════════════════════════════════════════════════════════════════════════
export const DataToHplanDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill
      style={{
        background: BG,
        fontFamily: SANS,
        overflow: 'hidden',
      }}
    >
      {/* grain overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.75\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\' opacity=\'0.04\'/%3E%3C/svg%3E")',
          backgroundSize: '200px 200px',
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      {frame < 255 && <Scene1 frame={frame} />}
      {frame >= 225 && frame < 495 && <Scene2 frame={frame} fps={fps} />}
      {frame >= 465 && frame < 735 && <Scene3 frame={frame} fps={fps} />}
      {frame >= 705 && <Scene4 frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};
