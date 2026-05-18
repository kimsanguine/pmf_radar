/**
 * AutoReplyDemo.tsx — V1: 자동 응답 데모
 * minimal big-text redesign (R11)
 *
 * 5 scenes × 6s = 30s (900 frames @30fps)
 * 1920×1080, 배경 #0a0a14
 *
 * Scene 1 (0~180):   카톡 메시지 한 줄 — inq-001 도착
 * Scene 2 (180~360): SETUP / STRONG / BUILD 분류 결과
 * Scene 3 (360~540): AUTO-REPLY GATE ✅ 5조건 통과
 * Scene 4 (540~720): 답변 메시지 한 줄 — AI 자동 응답
 * Scene 5 (720~900): "AI 자동 응답으로 검토 부담 ↓" outro
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
const BG      = '#0a0a14';
const RED     = '#a6492a';
const GREEN   = '#2D8A4F';
const GOLD    = '#D6A238';
const WHITE   = '#F5F3EE';
const MUTED   = 'rgba(245,243,238,0.45)';
const KAKAO_Y = '#FEE500';

// ── 타이포그래피 ────────────────────────────────────────────────────────────
// DM Serif Display: 서사적 대제목 / JetBrains Mono: 데이터·코드
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

// ── 라벨 뱃지 ─────────────────────────────────────────────────────────────
const Label: React.FC<{ text: string; color?: string; op: number }> = ({
  text,
  color = 'rgba(245,243,238,0.18)',
  op,
}) => (
  <div
    style={{
      opacity: op,
      display: 'inline-flex',
      alignItems: 'center',
      background: color,
      borderRadius: 6,
      padding: '8px 24px',
      fontFamily: MONO,
      fontSize: 32,
      fontWeight: 700,
      color: WHITE,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    }}
  >
    {text}
  </div>
);

// ── 수평 구분선 ────────────────────────────────────────────────────────────
const HR: React.FC<{ color?: string; op: number; widthPct?: number }> = ({
  color = 'rgba(245,243,238,0.15)',
  op,
  widthPct = 100,
}) => (
  <div
    style={{
      opacity: op,
      width: `${widthPct}%`,
      height: 1,
      background: color,
      margin: '0 auto',
    }}
  />
);

// ══════════════════════════════════════════════════════════════════════════
// Scene 1 (0~180): 카카오 메시지 도착
// 카드 중앙에 메시지 텍스트 단독 등장
// ══════════════════════════════════════════════════════════════════════════
const Scene1: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 0, 180);

  const labelOp = fadeIn(frame, 15, 20);
  const cardScale = spring({
    frame: frame - 30,
    fps,
    config: { damping: 22, stiffness: 180 },
  });
  const cardOp = fadeIn(frame, 30, 24);
  const textOp  = fadeIn(frame, 55, 30);

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
      }}
    >
      {/* 채널 라벨 */}
      <Label
        text="Kakao 오픈채팅  ·  inq-001"
        color={`${KAKAO_Y}22`}
        op={labelOp}
      />

      {/* 메시지 카드 */}
      <div
        style={{
          opacity: cardOp,
          transform: `scale(${cardScale})`,
          background: '#FFFFFF',
          borderRadius: 24,
          padding: '56px 80px',
          maxWidth: 1320,
          width: '100%',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          position: 'relative',
        }}
      >
        {/* 카카오 노란 띠 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 8,
            background: KAKAO_Y,
            borderRadius: '24px 24px 0 0',
          }}
        />
        <div
          style={{
            opacity: textOp,
            fontFamily: SANS,
            fontSize: 64,
            fontWeight: 600,
            color: '#1A1A1A',
            lineHeight: 1.55,
            letterSpacing: -0.3,
          }}
        >
          맥에서 설치하다가 zsh: command not found가 떠서
          <br />
          40분째 멈춰있어요. 강의는 좋은데 여기서 막히니까
          <br />
          시작도 못 하겠어요.
        </div>
        {/* 시간 */}
        <div
          style={{
            opacity: textOp * 0.55,
            marginTop: 24,
            fontFamily: SANS,
            fontSize: 34,
            color: '#888888',
            textAlign: 'right',
          }}
        >
          오후 2:14
        </div>
      </div>

      <Caption text="카카오 오픈채팅 — 일반 문의 도착" op={sceneOp(frame, 15, 165)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 2 (180~360): 분류 결과 — SETUP / STRONG / BUILD
// 세 단어가 세로로 순차 등장
// ══════════════════════════════════════════════════════════════════════════
const Scene2: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op  = sceneOp(frame, 180, 360);
  const lf  = frame - 180; // local frame

  const labelOp = fadeIn(frame, 190, 18);

  const words = [
    { text: 'SETUP',  color: RED,   delay: 15 },
    { text: 'STRONG', color: GOLD,  delay: 45 },
    { text: 'BUILD',  color: GREEN, delay: 75 },
  ];

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
      <Label text="PMF Radar — 자동 분류 결과" op={labelOp} />

      <div style={{ height: 48 }} />

      {words.map(({ text, color, delay }) => {
        const wordOp = fadeIn(lf, delay, 20);
        const wordY  = interpolate(lf, [delay, delay + 20], [40, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={text}
            style={{
              opacity: wordOp,
              transform: `translateY(${wordY}px)`,
              fontFamily: SERIF,
              fontSize: 160,
              fontWeight: 400,
              color,
              lineHeight: 1.05,
              letterSpacing: -2,
            }}
          >
            {text}
          </div>
        );
      })}

      <Caption text="PMF Radar 분류: setup / strong / build" op={sceneOp(frame, 195, 345)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 3 (360~540): AUTO-REPLY GATE — 5조건 체크
// ══════════════════════════════════════════════════════════════════════════
const GATE_ITEMS = [
  '반복 가능한 category (setup)',
  'strength = strong',
  'guardrail 유형 아님',
  '운영 시간 내 (22:00–08:00 제외)',
  'daily_send_cap 미초과',
];

const Scene3: React.FC<{ frame: number }> = ({ frame }) => {
  const op = sceneOp(frame, 360, 540);
  const lf = frame - 360;

  const titleOp = fadeIn(lf, 10, 20);
  const titleY  = interpolate(lf, [10, 30], [24, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 48,
      }}
    >
      {/* 타이틀 */}
      <div
        style={{
          opacity: titleOp,
          transform: `translateY(${titleY}px)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 44,
            fontWeight: 700,
            color: MUTED,
            letterSpacing: 3,
            textTransform: 'uppercase',
            marginBottom: 16,
          }}
        >
          Auto-Reply Gate
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontSize: 128,
            fontWeight: 400,
            color: GREEN,
            lineHeight: 1,
            letterSpacing: -1,
          }}
        >
          5조건 통과 ✅
        </div>
      </div>

      <HR color={`${GREEN}40`} op={fadeIn(lf, 35, 15)} widthPct={60} />

      {/* 조건 목록 */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          width: '100%',
          maxWidth: 960,
        }}
      >
        {GATE_ITEMS.map((item, i) => {
          const itemOp = fadeIn(lf, 45 + i * 15, 18);
          const itemX  = interpolate(lf, [45 + i * 15, 63 + i * 15], [-20, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={item}
              style={{
                opacity: itemOp,
                transform: `translateX(${itemX}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
              }}
            >
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 40,
                  color: GREEN,
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ✓
              </span>
              <span
                style={{
                  fontFamily: SANS,
                  fontSize: 40,
                  fontWeight: 500,
                  color: WHITE,
                  opacity: 0.82,
                  lineHeight: 1.4,
                }}
              >
                {item}
              </span>
            </div>
          );
        })}
      </div>

      <Caption text="Auto-Reply Gate — 5조건 모두 통과" op={sceneOp(frame, 375, 525)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 4 (540~720): 자동 응답 메시지 발송
// ══════════════════════════════════════════════════════════════════════════
const Scene4: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 540, 720);
  const lf = frame - 540;

  const labelOp = fadeIn(lf, 10, 18);

  const cardScale = spring({
    frame: lf - 25,
    fps,
    config: { damping: 24, stiffness: 160 },
  });
  const cardOp = fadeIn(lf, 25, 24);
  const textOp  = fadeIn(lf, 50, 28);
  const tagOp   = fadeIn(lf, 80, 24);

  return (
    <AbsoluteFill
      style={{
        opacity: op,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 40,
      }}
    >
      <Label text="AI 자동 응답 — 운영자 개입 없음" color={`${GREEN}25`} op={labelOp} />

      {/* 답변 카드 */}
      <div
        style={{
          opacity: cardOp,
          transform: `scale(${cardScale})`,
          background: '#14231A',
          border: `2px solid ${GREEN}55`,
          borderRadius: 24,
          padding: '56px 80px',
          maxWidth: 1320,
          width: '100%',
          boxShadow: `0 24px 80px rgba(45,138,79,0.15)`,
          position: 'relative',
        }}
      >
        {/* 녹색 상단 띠 */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: `linear-gradient(90deg, ${GREEN}, transparent)`,
            borderRadius: '24px 24px 0 0',
          }}
        />
        <div
          style={{
            opacity: textOp,
            fontFamily: SANS,
            fontSize: 64,
            fontWeight: 500,
            color: WHITE,
            lineHeight: 1.6,
            letterSpacing: -0.2,
          }}
        >
          사용 중인 OS와 에러 문구를 확인한 뒤,
          <br />
          해당 체크포인트부터 안내하겠습니다.
        </div>
        <div
          style={{
            opacity: textOp * 0.5,
            marginTop: 24,
            fontFamily: SANS,
            fontSize: 34,
            color: `${GREEN}CC`,
            textAlign: 'right',
          }}
        >
          오후 2:14
        </div>
      </div>

      {/* AI 뱃지 */}
      <div
        style={{
          opacity: tagOp,
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          background: `${GREEN}18`,
          border: `1px solid ${GREEN}40`,
          borderRadius: 40,
          padding: '16px 40px',
          fontFamily: MONO,
          fontSize: 36,
          fontWeight: 700,
          color: GREEN,
          letterSpacing: 1,
        }}
      >
        ⚡ PMF Radar (AI 자동) — 즉시 발송 완료
      </div>

      <Caption text="AI 자동 응답 즉시 발송 — 운영자 개입 없음" op={sceneOp(frame, 555, 705)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 5 (720~900): Outro — "검토 부담 ↓"
// ══════════════════════════════════════════════════════════════════════════
const Scene5: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 720, 900);
  const lf = frame - 720;

  const lineScale = spring({
    frame: lf - 10,
    fps,
    config: { damping: 30, stiffness: 120 },
  });
  const topOp  = fadeIn(lf, 20, 25);
  const topY   = interpolate(lf, [20, 45], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const botOp  = fadeIn(lf, 55, 25);
  const botY   = interpolate(lf, [55, 80], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagOp  = fadeIn(lf, 90, 25);

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
      {/* 상단 강조선 */}
      <div
        style={{
          width: `${lineScale * 240}px`,
          height: 3,
          background: RED,
          borderRadius: 2,
          marginBottom: 56,
        }}
      />

      {/* 메인 카피 라인 1 */}
      <div
        style={{
          opacity: topOp,
          transform: `translateY(${topY}px)`,
          fontFamily: SERIF,
          fontSize: 140,
          fontWeight: 400,
          color: WHITE,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}
      >
        AI 자동 응답으로
      </div>

      {/* 메인 카피 라인 2 — 강조 */}
      <div
        style={{
          opacity: botOp,
          transform: `translateY(${botY}px)`,
          fontFamily: SERIF,
          fontSize: 140,
          fontWeight: 400,
          color: RED,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}
      >
        검토 부담 ↓
      </div>

      <div style={{ height: 64 }} />

      {/* 부제 */}
      <div
        style={{
          opacity: botOp * 0.7,
          fontFamily: SANS,
          fontSize: 44,
          fontWeight: 400,
          color: MUTED,
          textAlign: 'center',
          lineHeight: 1.7,
          maxWidth: 960,
        }}
      >
        반복 문의를 5조건 Auto-Reply Gate 로 필터링,
        <br />
        담당자 개입 없이 즉시 응답
      </div>

      <div style={{ height: 56 }} />

      {/* hplan 태그 */}
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

      <Caption text="hplan PMF Signal Radar — 반복 CS 자동화" op={sceneOp(frame, 735, 885)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// AutoReplyDemo — 메인
// ══════════════════════════════════════════════════════════════════════════
export const AutoReplyDemo: React.FC = () => {
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
      {/* 배경 노이즈 grain — subtle */}
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

      {frame < 195 && <Scene1 frame={frame} fps={fps} />}
      {frame >= 165 && frame < 375 && <Scene2 frame={frame} fps={fps} />}
      {frame >= 345 && frame < 555 && <Scene3 frame={frame} />}
      {frame >= 525 && frame < 735 && <Scene4 frame={frame} fps={fps} />}
      {frame >= 705 && <Scene5 frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};
