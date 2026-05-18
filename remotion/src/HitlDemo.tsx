import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from 'remotion';
import { KakaoFrame, KakaoMessage } from './shared/KakaoFrame';
import { TelegramFrame, TelegramSignal } from './shared/TelegramFrame';

// ─── 셀 1/5: Fixture 데이터 ─────────────────────────────────────────────────

const INBOUND_MESSAGE: KakaoMessage = {
  author: 'B2B 리드 — 사내 데이터 보안 검토',
  text: '사내 CS 데이터를 넣어도 되는지 법무팀이\n물어볼 것 같습니다. 데이터 삭제와\n보관 정책이 있나요?',
  time: '오후 3:42',
  type: 'inbound',
};

const OUTBOUND_REPLY: KakaoMessage = {
  author: '운영자 — kimsanguine (수동 검토)',
  text: '실데이터 사용 전에는 익명화 샘플과\n보관/삭제 기준부터 확인하겠습니다.\n별도 보안 검토 자료를 메일로 전달드릴게요.',
  time: '오후 3:48',
  type: 'outbound',
};

const CHANNEL_LABEL = 'Channel Talk';

const TELEGRAM_SIGNAL: TelegramSignal = {
  category: 'privacy',
  categoryLabel: '개인정보 / B2B 리드',
  strength: 'strong',
  channel: 'mock_channel_talk',
  timestamp: '2026-05-18 오후 3:42',
};

// ─── 셀 2/5: 장면 구간 & 색상 상수 ─────────────────────────────────────────
// Scene 1: 0~180   (0~6s)   KakaoFrame intro
// Scene 2: 180~330 (6~11s)  분류 결과 (InlineBadge + ClassificationCards)
// Scene 3: 330~480 (11~16s) Gate Block 차단
// Scene 4: 480~660 (16~22s) TelegramFrame 알림
// Scene 5: 660~900 (22~30s) KakaoFrame 수동 답변 + outro

const BG_PAGE       = '#FAF8F4';
const STOP_RED      = '#C8623A';
const PRIVACY_GREEN = '#2D7A57';
const TEXT_DARK     = '#1A1A1A';
const TEXT_MUTED    = '#5E5850';
const TG_BLUE       = '#5288C1';

// ─── 셀 3/5: 유틸 & 인라인 컴포넌트 ────────────────────────────────────────

function sceneOpacity(
  frame: number,
  startFrame: number,
  endFrame: number,
  fadeIn = 14,
  fadeOut = 14,
): number {
  const inVal = fadeIn > 0
    ? interpolate(frame, [startFrame, startFrame + fadeIn], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.out(Easing.cubic),
      })
    : (frame >= startFrame ? 1 : 0);
  const outVal = fadeOut > 0
    ? interpolate(frame, [endFrame - fadeOut, endFrame], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: Easing.in(Easing.cubic),
      })
    : (frame < endFrame ? 1 : 0);
  return Math.min(inVal, outVal);
}

// ── 라벨 배지 유틸 ─────────────────────────────────────────────────────────
const LabelBadge: React.FC<{
  text: string;
  color: string;
  bg: string;
  opacity?: number;
}> = ({ text, color, bg, opacity = 1 }) => (
  <div
    style={{
      opacity,
      background: bg,
      border: `1.5px solid ${color}40`,
      borderRadius: 10,
      padding: '10px 24px',
      fontSize: 40,
      fontWeight: 700,
      color,
      fontFamily: '"Noto Sans KR", sans-serif',
      whiteSpace: 'nowrap',
      letterSpacing: 0.2,
    }}
  >
    {text}
  </div>
);

// ── PMF Radar 인라인 배지 (Scene 2) ─────────────────────────────────────────
// 수학 검증 (너비 1440px):
//   categoryLabel "개인정보" = 4자 × 80px × 0.55 ≈ 176px → 내부 여유 충분 ✓
//   sourceLabel "Channel Talk" = 12자 × 42px × 0.55 ≈ 277 + padding 72 = 349 < 500 ✓
const InlineBadge: React.FC<{ fadeIn: number }> = ({ fadeIn }) => (
  <div
    style={{
      opacity: fadeIn,
      width: '100%',
      maxWidth: 1440,
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 12px 32px rgba(0,0,0,0.10)',
      border: `2px solid ${PRIVACY_GREEN}`,
      background: '#FFFFFF',
    }}
  >
    <div
      style={{
        background: PRIVACY_GREEN,
        padding: '28px 44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        <span style={{ fontSize: 80, flexShrink: 0, lineHeight: 1 }}>🛡</span>
        <div>
          <div
            style={{
              color: 'rgba(255,255,255,0.80)',
              fontSize: 32,
              fontWeight: 700,
              letterSpacing: 2,
              fontFamily: '"JetBrains Mono", "Courier New", monospace',
            }}
          >
            PMF RADAR
          </div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 80,
              fontWeight: 900,
              lineHeight: 1.1,
              fontFamily: '"Noto Serif KR", "Noto Serif", serif',
              letterSpacing: -0.5,
            }}
          >
            개인정보
          </div>
        </div>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.22)',
          borderRadius: 32,
          padding: '14px 36px',
          color: '#FFFFFF',
          fontSize: 42,
          fontWeight: 800,
          letterSpacing: 0.5,
          fontFamily: '"Noto Sans KR", sans-serif',
          whiteSpace: 'nowrap',
        }}
      >
        Channel Talk
      </div>
    </div>
    <div
      style={{
        padding: '18px 44px',
        display: 'flex',
        gap: 16,
        background: '#FAFAF8',
      }}
    >
      {[
        { text: 'privacy', color: PRIVACY_GREEN, bg: `${PRIVACY_GREEN}12`, mono: true },
        { text: '강한 신호', color: TEXT_MUTED, bg: '#F0EDE8', mono: false },
        { text: '가드레일', color: STOP_RED, bg: `${STOP_RED}12`, mono: false },
      ].map(({ text, color, bg, mono }) => (
        <div
          key={text}
          style={{
            background: bg,
            border: `1.5px solid ${color}30`,
            borderRadius: 10,
            padding: '8px 20px',
            fontSize: 38,
            fontWeight: 700,
            color,
            fontFamily: mono
              ? '"JetBrains Mono", "Courier New", monospace'
              : '"Noto Sans KR", sans-serif',
            whiteSpace: 'nowrap',
          }}
        >
          {text}
        </div>
      ))}
    </div>
  </div>
);

// ── 분류 결과 카드 3개 (Scene 2) ─────────────────────────────────────────────
// 수학 검증 (1440px 내 3등분, gap 28):
//   카드 너비 ≈ (1440 - 28×2) / 3 = 461px
//   value "guardrail" = 9자 × 48px × 0.6 ≈ 259 + padding 40×2 = 339 < 461 ✓
const ClassificationCards: React.FC<{ revealAt: number }> = ({ revealAt }) => {
  const ITEMS = [
    { label: '카테고리', value: 'privacy', color: PRIVACY_GREEN, mono: true },
    { label: '신호 강도', value: 'strong',  color: PRIVACY_GREEN, mono: false },
    { label: '결정 유형', value: 'guardrail', color: STOP_RED, mono: true },
  ];

  return (
    <div style={{ display: 'flex', gap: 28, width: '100%', maxWidth: 1440 }}>
      {ITEMS.map(({ label, value, color, mono }, idx) => {
        const cardOp = interpolate(
          revealAt,
          [idx * 0.15, idx * 0.15 + 0.25],
          [0, 1],
          {
            extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            easing: Easing.out(Easing.cubic),
          },
        );
        const cardY = interpolate(
          revealAt,
          [idx * 0.15, idx * 0.15 + 0.25],
          [20, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        return (
          <div
            key={label}
            style={{
              flex: 1,
              opacity: cardOp,
              transform: `translateY(${cardY}px)`,
              background: '#FFFFFF',
              borderRadius: 20,
              border: `2px solid ${color}28`,
              borderTop: `5px solid ${color}`,
              padding: '28px 36px',
              boxShadow: '0 10px 28px rgba(0,0,0,0.07)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 600,
                color: TEXT_MUTED,
                letterSpacing: 0.5,
                marginBottom: 14,
                fontFamily: '"Noto Sans KR", sans-serif',
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: 48,
                fontWeight: 900,
                color,
                fontFamily: mono
                  ? '"JetBrains Mono", "Courier New", monospace'
                  : '"Noto Sans KR", sans-serif',
                letterSpacing: mono ? 1 : 0,
                whiteSpace: 'nowrap',
              }}
            >
              {value}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── GateBlock (Scene 3 전용 inline) ──────────────────────────────────────────
// 수학 검증 (가용 너비 ≈ 1920 - 56×2(padding) - 460(KakaoFrame) - 32(gap) - 64(화살표+gap) ≈ 1252px):
//   행 구성: emoji 38 + gap 20 + label(flex-1) + status 200 + padding 28×2 = 314px 고정
//   label "decisionType ≠ guardrail" = 22자 × 36px × 0.55 ≈ 435px
//   flex-1 최소 = 1252 - 314 = 938px → label 여유 충분 ✓
//   FAIL→STOP = 9자 × 34px × 0.55 ≈ 168px < 200 ✓
const CHECK_ITEMS: Array<{ label: string; pass: boolean }> = [
  { label: 'strength ≥ medium',       pass: true  },
  { label: 'category != unknown',      pass: true  },
  { label: 'source is trusted',        pass: true  },
  { label: 'reply template exists',    pass: true  },
  { label: 'decisionType ≠ guardrail', pass: false },
];

const GateBlock: React.FC<{ revealAt: number }> = ({ revealAt }) => {
  const panelOp = interpolate(revealAt, [0, 0.18], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const panelY = interpolate(revealAt, [0, 0.18], [28, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const stopOp = interpolate(revealAt, [0.78, 1.0], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const stopScale = interpolate(revealAt, [0.78, 1.0], [0.88, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.4)),
  });

  return (
    <div
      style={{
        opacity: panelOp,
        transform: `translateY(${panelY}px)`,
        width: '100%',
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
        border: `2px solid ${STOP_RED}`,
        background: '#FAFAF8',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: STOP_RED,
          padding: '24px 40px',
          display: 'flex',
          alignItems: 'center',
          gap: 22,
        }}
      >
        <span style={{ fontSize: 64, flexShrink: 0, lineHeight: 1 }}>🚫</span>
        <div>
          <div
            style={{
              color: 'rgba(255,255,255,0.82)',
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 2,
              fontFamily: '"JetBrains Mono", "Courier New", monospace',
            }}
          >
            AUTO-REPLY GATE
          </div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 50,
              fontWeight: 900,
              fontFamily: '"Noto Sans KR", sans-serif',
              lineHeight: 1.2,
            }}
          >
            5조건 검사
          </div>
        </div>
        <div
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.20)',
            borderRadius: 28,
            padding: '10px 28px',
            color: '#FFFFFF',
            fontSize: 36,
            fontWeight: 800,
            letterSpacing: 0.5,
            fontFamily: '"JetBrains Mono", "Courier New", monospace',
            whiteSpace: 'nowrap',
          }}
        >
          HITL required
        </div>
      </div>

      {/* 조건 목록 */}
      <div
        style={{
          padding: '18px 32px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {CHECK_ITEMS.map((item, idx) => {
          const itemOp = interpolate(
            revealAt,
            [0.18 + idx * 0.10, 0.18 + idx * 0.10 + 0.12],
            [0, 1],
            {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
              easing: Easing.out(Easing.cubic),
            },
          );
          const itemX = interpolate(
            revealAt,
            [0.18 + idx * 0.10, 0.18 + idx * 0.10 + 0.12],
            [-14, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          return (
            <div
              key={item.label}
              style={{
                opacity: itemOp,
                transform: `translateX(${itemX}px)`,
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '14px 28px',
                borderRadius: 14,
                background: item.pass ? '#EBF7EF' : '#FDECEA',
                border: `1.5px solid ${item.pass ? '#A8D9B8' : '#F0B0A0'}`,
              }}
            >
              <span style={{ fontSize: 36, flexShrink: 0, lineHeight: 1 }}>
                {item.pass ? '✅' : '❌'}
              </span>
              <span
                style={{
                  fontFamily: '"JetBrains Mono", "Courier New", monospace',
                  fontSize: 34,
                  fontWeight: 700,
                  color: item.pass ? '#1A6634' : STOP_RED,
                  flex: 1,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 32,
                  fontWeight: 800,
                  color: item.pass ? PRIVACY_GREEN : STOP_RED,
                  letterSpacing: 0.5,
                  minWidth: 200,
                  textAlign: 'right',
                  fontFamily: '"JetBrains Mono", "Courier New", monospace',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.pass ? 'PASS' : 'FAIL → STOP'}
              </span>
            </div>
          );
        })}
      </div>

      {/* STOP 배너 */}
      <div
        style={{
          opacity: stopOp,
          transform: `scale(${stopScale})`,
          transformOrigin: 'center center',
          margin: '4px 32px 24px',
          padding: '24px 40px',
          borderRadius: 18,
          background: STOP_RED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          boxShadow: `0 6px 20px ${STOP_RED}48`,
        }}
      >
        <span style={{ fontSize: 64, flexShrink: 0, lineHeight: 1 }}>🛑</span>
        <div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 46,
              fontWeight: 900,
              letterSpacing: 0.5,
              fontFamily: '"Noto Sans KR", sans-serif',
              wordBreak: 'keep-all',
            }}
          >
            AUTO-REPLY 차단
          </div>
          <div
            style={{
              color: 'rgba(255,255,255,0.82)',
              fontSize: 32,
              fontFamily: '"Noto Sans KR", sans-serif',
              marginTop: 6,
              wordBreak: 'keep-all',
            }}
          >
            guardrail 감지 → 운영자 HITL 검토 필요
          </div>
        </div>
      </div>
    </div>
  );
};

// ── 자막 바 ──────────────────────────────────────────────────────────────────
// fontSize 44 (이전 52 대비 15% 축소) — 자막이 콘텐츠를 압도하지 않음
// 가장 긴 자막 "PMF Radar 분류: privacy / strong / guardrail"
//   = 38자 × 44 × 0.55 ≈ 919 + padding 72 = 991 < 1920 ✓
const Subtitle: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 44,
      left: '50%',
      transform: 'translateX(-50%)',
      opacity,
      background: 'rgba(26,26,26,0.78)',
      borderRadius: 12,
      padding: '12px 36px',
      color: '#FFFFFF',
      fontSize: 44,
      fontWeight: 700,
      letterSpacing: 0.3,
      whiteSpace: 'nowrap',
      fontFamily: '"Noto Sans KR", sans-serif',
      backdropFilter: 'blur(6px)',
    }}
  >
    {text}
  </div>
);

// ── Outro 오버레이 ────────────────────────────────────────────────────────────
// "위험·고가치 CS 는 사람이 판단" = 15자 × 112px × 0.55 ≈ 924 < 1760 ✓
const OutroOverlay: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      opacity,
      background: 'rgba(26,26,26,0.90)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 28,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        color: '#FFFFFF',
        fontSize: 112,
        fontWeight: 900,
        letterSpacing: -1,
        fontFamily: '"Noto Serif KR", "Noto Serif", Georgia, serif',
        textAlign: 'center',
        wordBreak: 'keep-all',
        maxWidth: 1600,
        lineHeight: 1.2,
      }}
    >
      위험·고가치 CS 는 사람이 판단
    </div>
    <div
      style={{
        color: 'rgba(255,255,255,0.58)',
        fontSize: 52,
        fontFamily: '"Noto Sans KR", sans-serif',
        textAlign: 'center',
        wordBreak: 'keep-all',
        letterSpacing: 0.3,
      }}
    >
      PMF Signal Radar — HITL 검토 플로우
    </div>
  </div>
);

// ─── 셀 4/5: Scene 4 좌측 분류 요약 카드 ────────────────────────────────────

const TriggerSummaryCard: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      opacity,
      background: '#FFFFFF',
      borderRadius: 18,
      border: `2px solid ${PRIVACY_GREEN}`,
      boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        background: PRIVACY_GREEN,
        padding: '16px 22px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span style={{ fontSize: 44, lineHeight: 1 }}>🛡</span>
      <div>
        <div
          style={{
            color: 'rgba(255,255,255,0.80)',
            fontSize: 24,
            fontFamily: '"JetBrains Mono", "Courier New", monospace',
            letterSpacing: 1,
          }}
        >
          PMF RADAR
        </div>
        <div
          style={{
            color: '#FFFFFF',
            fontSize: 48,
            fontWeight: 900,
            fontFamily: '"Noto Serif KR", "Noto Serif", serif',
          }}
        >
          개인정보
        </div>
      </div>
    </div>
    <div style={{ padding: '12px 18px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {['privacy', '강한 신호', '가드레일'].map((t) => (
        <div
          key={t}
          style={{
            background: '#F0EDE8',
            borderRadius: 8,
            padding: '6px 14px',
            fontSize: 28,
            fontWeight: 700,
            color: TEXT_MUTED,
            fontFamily: '"Noto Sans KR", sans-serif',
            whiteSpace: 'nowrap',
          }}
        >
          {t}
        </div>
      ))}
    </div>
  </div>
);

// ─── 셀 5/5: HitlDemo 메인 ──────────────────────────────────────────────────

export const HitlDemo: React.FC = () => {
  const frame = useCurrentFrame();

  // ── Scene 1: 0~180 ──
  const s1Op = sceneOpacity(frame, 0, 180);
  const inboundReveal = interpolate(frame, [60, 90], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ── Scene 2: 180~330 ──
  const s2Op = sceneOpacity(frame, 180, 330);
  const badgeFadeIn = interpolate(frame, [192, 240], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const cardsRevealAt = interpolate(frame, [228, 306], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // ── Scene 3: 330~480 ──
  const s3Op = sceneOpacity(frame, 330, 480);
  const gateRevealAt = interpolate(frame, [344, 470], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const s3KakaoOp = interpolate(frame, [330, 356], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ── Scene 4: 480~660 ──
  const s4Op = sceneOpacity(frame, 480, 660);
  const tgRevealAt = interpolate(frame, [480, 570], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const s4LeftOp = interpolate(frame, [480, 514], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const s4ArrowOp = interpolate(frame, [510, 540], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ── Scene 5: 660~900 ──
  const s5Op = sceneOpacity(frame, 660, 900, 14, 0);
  const outboundReveal = interpolate(frame, [780, 816], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const outroOp = interpolate(frame, [870, 900], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const s5HeaderOp = interpolate(frame, [660, 688], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // ── 자막 ──
  const sub1Op = sceneOpacity(frame, 0, 180, 8, 8);
  const sub2Op = sceneOpacity(frame, 180, 330, 8, 8);
  const sub3Op = sceneOpacity(frame, 330, 480, 8, 8);
  const sub4Op = sceneOpacity(frame, 480, 660, 8, 8);
  const sub5Op = sceneOpacity(frame, 660, 870, 8, 8);

  return (
    <AbsoluteFill
      style={{
        background: BG_PAGE,
        fontFamily: '"Noto Sans KR", Apple SD Gothic Neo, sans-serif',
        color: TEXT_DARK,
        overflow: 'hidden',
      }}
    >
      {/* ────────────────────────────────────────────────────────────────────
          Scene 1: KakaoFrame intro (0~180)
          KakaoFrame 1400×760 — 말풍선 maxWidth=76%≈1064px, 텍스트 3줄 수용
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s1Op,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 100px 120px',
          flexDirection: 'column',
          gap: 24,
        }}
      >
        <div
          style={{
            width: 1400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <LabelBadge
            text="Channel Talk · B2B 리드 인바운드"
            color={PRIVACY_GREEN}
            bg={`${PRIVACY_GREEN}14`}
          />
          <LabelBadge text="inq-029" color={TEXT_MUTED} bg="#F0EDE8" />
        </div>
        <div style={{ width: 1400, height: 760 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={inboundReveal}
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 2: 분류 결과 (180~330)
          상단 타이틀 56px → InlineBadge 1440px → ClassificationCards 3개
          수직 gap 36, 전체 중앙 정렬
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s2Op,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 36,
          padding: '60px 120px',
        }}
      >
        <div
          style={{
            fontSize: 52,
            fontWeight: 700,
            color: TEXT_MUTED,
            letterSpacing: 0.3,
            fontFamily: '"Noto Sans KR", sans-serif',
            alignSelf: 'flex-start',
          }}
        >
          PMF Radar 자동 분류 결과
        </div>
        <InlineBadge fadeIn={badgeFadeIn} />
        <ClassificationCards revealAt={cardsRevealAt} />
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 3: Gate Block (330~480)
          좌 KakaoFrame 460×560 + 화살표 + 우 GateBlock
          가용 너비: 1920 - 112 - 460 - 32 - ~60 ≈ 1256px
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s3Op,
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '56px 56px',
        }}
      >
        <div style={{ width: 460, height: 560, opacity: s3KakaoOp, flexShrink: 0 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={1}
          />
        </div>
        <div
          style={{
            opacity: s3KakaoOp,
            fontSize: 60,
            color: STOP_RED,
            fontWeight: 900,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          →
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <GateBlock revealAt={gateRevealAt} />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 4: Telegram 알림 (480~660)
          좌 분류 요약 480px + 화살표 + 우 TelegramFrame flex-1 h=880
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s4Op,
          display: 'flex',
          alignItems: 'center',
          gap: 28,
          padding: '60px 56px',
        }}
      >
        <div
          style={{
            width: 480,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          <div
            style={{
              fontSize: 36,
              color: TEXT_MUTED,
              fontWeight: 600,
              letterSpacing: 0.3,
              fontFamily: '"Noto Sans KR", sans-serif',
              wordBreak: 'keep-all',
              opacity: s4LeftOp,
            }}
          >
            분류 결과 (HITL 트리거)
          </div>
          <TriggerSummaryCard opacity={s4LeftOp} />

          {/* HITL 플로우 화살표 */}
          <div
            style={{
              opacity: s4ArrowOp,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <div style={{ width: 2, height: 24, background: STOP_RED, borderRadius: 2 }} />
            <div style={{ fontSize: 28, color: STOP_RED, lineHeight: 1 }}>▼</div>
            <div
              style={{
                background: `${STOP_RED}12`,
                border: `1.5px solid ${STOP_RED}40`,
                borderRadius: 12,
                padding: '12px 18px',
                fontSize: 32,
                fontWeight: 700,
                color: STOP_RED,
                textAlign: 'center',
                fontFamily: '"Noto Sans KR", sans-serif',
                wordBreak: 'keep-all',
                lineHeight: 1.6,
                width: '100%',
              }}
            >
              {'guardrail → HITL required\n운영자 Telegram 알림 전송'}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 60,
            color: TG_BLUE,
            fontWeight: 900,
            flexShrink: 0,
            opacity: s4LeftOp,
            lineHeight: 1,
          }}
        >
          →
        </div>

        <div style={{ flex: 1, height: 880, minWidth: 0 }}>
          <TelegramFrame
            botName="PMF Radar P2"
            chatLabel="kimsanguine (운영자)"
            signal={TELEGRAM_SIGNAL}
            revealAt={tgRevealAt}
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 5: 수동 답변 (660~900) — Scene 1 비례 동일
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s5Op,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 24,
          padding: '80px 100px 120px',
        }}
      >
        <div
          style={{
            width: 1400,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            opacity: s5HeaderOp,
          }}
        >
          <LabelBadge
            text="운영자 직접 검토 · 수동 답변"
            color={PRIVACY_GREEN}
            bg={`${PRIVACY_GREEN}14`}
          />
          <LabelBadge text="kimsanguine" color={TEXT_MUTED} bg="#F0EDE8" />
        </div>
        <div style={{ width: 1400, height: 760 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE, OUTBOUND_REPLY]}
            revealUpTo={1 + outboundReveal}
          />
        </div>
      </div>

      {/* Outro */}
      <OutroOverlay opacity={outroOp} />

      {/* 자막 */}
      <Subtitle text="Channel Talk 로 B2B 리드 문의 도착" opacity={sub1Op} />
      <Subtitle text="PMF Radar 분류: privacy / strong / guardrail" opacity={sub2Op} />
      <Subtitle text="Auto-Reply Gate 차단 → HITL required" opacity={sub3Op} />
      <Subtitle text="운영자 Telegram 으로 알림 전송" opacity={sub4Op} />
      <Subtitle text="운영자가 직접 검토 후 응답" opacity={sub5Op} />
    </AbsoluteFill>
  );
};
