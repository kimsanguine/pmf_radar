/**
 * HitlDemo.tsx — V2: HITL 검토 데모
 * minimal big-text redesign (R11)
 *
 * 5 scenes × 6s = 30s (900 frames @30fps)
 * 1920×1080, 배경 #0a0a14
 *
 * Scene 1 (0~180):   Channel Talk 메시지 — inq-029 privacy
 * Scene 2 (180~360): PRIVACY / STRONG / GUARDRAIL 분류
 * Scene 3 (360~540): 🛑 AUTO-REPLY 차단 + guardrail → HITL required
 * Scene 4 (540~720): 📱 Telegram 알림 → 운영자
 * Scene 5 (720~900): 운영자 직접 답변 + outro
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
const TG_BLUE = '#2AABEE';
const CT_BLUE = '#1A9AD5';

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

// ══════════════════════════════════════════════════════════════════════════
// Scene 1 (0~180): Channel Talk 메시지 도착
// ══════════════════════════════════════════════════════════════════════════
const Scene1: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 0, 180);
  const lf = frame;

  const labelOp = fadeIn(lf, 15, 20);
  const cardScale = spring({
    frame: lf - 30,
    fps,
    config: { damping: 22, stiffness: 180 },
  });
  const cardOp = fadeIn(lf, 30, 24);
  const textOp  = fadeIn(lf, 55, 30);

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
      <Label
        text="Channel Talk  ·  B2B 리드  ·  inq-029"
        color={`${CT_BLUE}22`}
        op={labelOp}
      />

      <div
        style={{
          opacity: cardOp,
          transform: `scale(${cardScale})`,
          background: '#0D1A26',
          border: `2px solid ${CT_BLUE}44`,
          borderRadius: 24,
          padding: '56px 80px',
          maxWidth: 1320,
          width: '100%',
          boxShadow: `0 24px 80px rgba(26,154,213,0.12)`,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 5,
            background: `linear-gradient(90deg, ${CT_BLUE}, transparent)`,
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
          사내 CS 데이터를 넣어도 되는지 법무팀이 물어볼 것 같습니다.
          <br />
          데이터 삭제와 보관 정책이 있나요?
        </div>
        <div
          style={{
            opacity: textOp * 0.5,
            marginTop: 24,
            fontFamily: SANS,
            fontSize: 34,
            color: `${CT_BLUE}99`,
            textAlign: 'right',
          }}
        >
          오후 3:42
        </div>
      </div>

      <Caption text="Channel Talk 로 B2B 리드 문의 도착" op={sceneOp(frame, 15, 165)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 2 (180~360): 분류 결과 — PRIVACY / STRONG / GUARDRAIL
// ══════════════════════════════════════════════════════════════════════════
const Scene2: React.FC<{ frame: number }> = ({ frame }) => {
  const op = sceneOp(frame, 180, 360);
  const lf = frame - 180;

  const labelOp = fadeIn(lf, 10, 18);

  const words = [
    { text: 'PRIVACY',   color: GREEN, delay: 15 },
    { text: 'STRONG',    color: GOLD,  delay: 45 },
    { text: 'GUARDRAIL', color: RED,   delay: 75 },
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
              fontSize: text === 'GUARDRAIL' ? 120 : 160,
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

      <Caption text="PMF Radar 분류: privacy / strong / guardrail" op={sceneOp(frame, 195, 345)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 3 (360~540): 🛑 AUTO-REPLY 차단
// ══════════════════════════════════════════════════════════════════════════
const Scene3: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 360, 540);
  const lf = frame - 360;

  const stopScale = spring({
    frame: lf - 15,
    fps,
    config: { damping: 18, stiffness: 200 },
  });
  const stopOp = fadeIn(lf, 15, 20);
  const subOp  = fadeIn(lf, 50, 25);
  const hitlOp = fadeIn(lf, 85, 25);

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
      {/* STOP 아이콘 */}
      <div
        style={{
          opacity: stopOp,
          transform: `scale(${stopScale})`,
          fontSize: 160,
          lineHeight: 1,
          marginBottom: 32,
        }}
      >
        🛑
      </div>

      {/* 메인 메시지 */}
      <div
        style={{
          opacity: stopOp,
          fontFamily: SERIF,
          fontSize: 120,
          fontWeight: 400,
          color: RED,
          lineHeight: 1.1,
          letterSpacing: -1,
          textAlign: 'center',
        }}
      >
        AUTO-REPLY 차단
      </div>

      <div style={{ height: 40 }} />

      {/* 서브 — guardrail 이유 */}
      <div
        style={{
          opacity: subOp,
          fontFamily: MONO,
          fontSize: 44,
          fontWeight: 700,
          color: MUTED,
          letterSpacing: 1,
          textAlign: 'center',
        }}
      >
        decisionType = guardrail → 자동 응답 금지
      </div>

      <div style={{ height: 48 }} />

      {/* HITL required 뱃지 */}
      <div
        style={{
          opacity: hitlOp,
          background: `${RED}18`,
          border: `2px solid ${RED}55`,
          borderRadius: 12,
          padding: '20px 56px',
          fontFamily: MONO,
          fontSize: 48,
          fontWeight: 900,
          color: RED,
          letterSpacing: 2,
          textTransform: 'uppercase',
        }}
      >
        HITL required
      </div>

      <Caption text="Auto-Reply Gate 차단 → HITL required" op={sceneOp(frame, 375, 525)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 4 (540~720): 📱 Telegram 알림 → 운영자
// ══════════════════════════════════════════════════════════════════════════
const Scene4: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 540, 720);
  const lf = frame - 540;

  const labelOp = fadeIn(lf, 10, 18);

  const cardScale = spring({
    frame: lf - 25,
    fps,
    config: { damping: 22, stiffness: 160 },
  });
  const cardOp  = fadeIn(lf, 25, 24);
  const arrowOp = fadeIn(lf, 65, 25);
  const targetOp = fadeIn(lf, 90, 25);

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
      <Label
        text="Telegram 알림 전송"
        color={`${TG_BLUE}22`}
        op={labelOp}
      />

      {/* Telegram 카드 */}
      <div
        style={{
          opacity: cardOp,
          transform: `scale(${cardScale})`,
          background: '#0D1F2E',
          border: `2px solid ${TG_BLUE}44`,
          borderRadius: 24,
          padding: '48px 72px',
          maxWidth: 1100,
          width: '100%',
          boxShadow: `0 24px 80px rgba(42,171,238,0.12)`,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 4,
            background: `linear-gradient(90deg, ${TG_BLUE}, transparent)`,
            borderRadius: '24px 24px 0 0',
          }}
        />
        {/* 헤더 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 32,
          }}
        >
          <span style={{ fontSize: 72 }}>📱</span>
          <div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 36,
                fontWeight: 700,
                color: TG_BLUE,
                letterSpacing: 1,
              }}
            >
              PMF Radar P2
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontSize: 32,
                color: MUTED,
                marginTop: 4,
              }}
            >
              Bot  →  kimsanguine (운영자)
            </div>
          </div>
        </div>

        {/* 알림 내용 */}
        <div
          style={{
            background: 'rgba(42,171,238,0.06)',
            border: `1px solid ${TG_BLUE}25`,
            borderRadius: 14,
            padding: '28px 36px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {[
            { label: 'category',    value: 'privacy',         color: GREEN },
            { label: 'strength',    value: 'strong',           color: GOLD  },
            { label: 'decision',    value: 'guardrail → HITL', color: RED   },
            { label: 'channel',     value: 'Channel Talk',     color: TG_BLUE },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 16,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 34,
                  fontWeight: 700,
                  color: MUTED,
                  width: 160,
                  flexShrink: 0,
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 40,
                  fontWeight: 900,
                  color,
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* → 운영자 */}
      <div
        style={{
          opacity: arrowOp,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
        }}
      >
        <div
          style={{
            width: 120,
            height: 2,
            background: `linear-gradient(90deg, ${TG_BLUE}, transparent)`,
            borderRadius: 2,
          }}
        />
        <div
          style={{
            opacity: targetOp,
            fontFamily: SANS,
            fontSize: 48,
            fontWeight: 700,
            color: WHITE,
          }}
        >
          운영자 검토 대기 중
        </div>
      </div>

      <Caption text="운영자 Telegram 으로 알림 전송" op={sceneOp(frame, 555, 705)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// Scene 5 (720~900): 운영자 직접 답변 + outro
// ══════════════════════════════════════════════════════════════════════════
const Scene5: React.FC<{ frame: number; fps: number }> = ({ frame, fps }) => {
  const op = sceneOp(frame, 720, 900);
  const lf = frame - 720;

  const lineScale = spring({
    frame: lf - 8,
    fps,
    config: { damping: 30, stiffness: 100 },
  });
  const topOp = fadeIn(lf, 20, 25);
  const topY  = interpolate(lf, [20, 45], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const botOp = fadeIn(lf, 55, 25);
  const botY  = interpolate(lf, [55, 80], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tagOp = fadeIn(lf, 100, 25);

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
          background: GREEN,
          borderRadius: 2,
          marginBottom: 56,
        }}
      />

      <div
        style={{
          opacity: topOp,
          transform: `translateY(${topY}px)`,
          fontFamily: SERIF,
          fontSize: 130,
          fontWeight: 400,
          color: WHITE,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}
      >
        위험·고가치 CS 는
      </div>

      <div
        style={{
          opacity: botOp,
          transform: `translateY(${botY}px)`,
          fontFamily: SERIF,
          fontSize: 130,
          fontWeight: 400,
          color: GREEN,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
        }}
      >
        사람이 판단
      </div>

      <div style={{ height: 64 }} />

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
        운영자 직접 검토 후 맞춤 응답
        <br />
        guardrail 감지 시 AI 는 개입하지 않는다
      </div>

      <div style={{ height: 56 }} />

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
        hplan · PMF Signal Radar — HITL 검토 플로우
      </div>

      <Caption text="운영자가 직접 검토 후 응답" op={sceneOp(frame, 735, 885)} />
    </AbsoluteFill>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// HitlDemo — 메인
// ══════════════════════════════════════════════════════════════════════════
export const HitlDemo: React.FC = () => {
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

      {frame < 195 && <Scene1 frame={frame} fps={fps} />}
      {frame >= 165 && frame < 375 && <Scene2 frame={frame} />}
      {frame >= 345 && frame < 555 && <Scene3 frame={frame} fps={fps} />}
      {frame >= 525 && frame < 735 && <Scene4 frame={frame} fps={fps} />}
      {frame >= 705 && <Scene5 frame={frame} fps={fps} />}
    </AbsoluteFill>
  );
};
