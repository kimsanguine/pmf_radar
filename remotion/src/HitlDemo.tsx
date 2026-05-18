import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { KakaoFrame, KakaoMessage } from './shared/KakaoFrame';
import { RadarBadge } from './shared/RadarBadge';
import { TelegramFrame, TelegramSignal } from './shared/TelegramFrame';

// ─── fixture: inq-029 (privacy / B2B) ─────────────────────────────────────

const INBOUND_MESSAGE: KakaoMessage = {
  author: 'B2B 리드 — 사내 데이터 보안 검토',
  text: '사내 CS 데이터를 넣어도 되는지 법무팀이 물어볼 것 같습니다. 데이터 삭제와 보관 정책이 있나요?',
  time: '오후 3:42',
  type: 'inbound',
};

const OUTBOUND_REPLY: KakaoMessage = {
  author: '운영자 — kimsanguine (수동 검토)',
  text: '실데이터 사용 전에는 익명화 샘플과 보관/삭제 기준부터 확인하겠습니다. 별도 보안 검토 자료를 메일로 전달드릴게요.',
  time: '오후 3:48',
  type: 'outbound',
};

const CHANNEL_LABEL = 'Channel Talk';

const CLASSIFICATION = {
  category: 'privacy',
  categoryLabel: '개인정보',
  strength: 'strong' as const,
  color: '#2D8A4F',
  decisionType: 'guardrail' as const,
  source: 'mock_channel_talk',
};

const TELEGRAM_SIGNAL: TelegramSignal = {
  category: 'privacy',
  categoryLabel: '개인정보 / B2B 리드',
  strength: 'strong',
  channel: 'mock_channel_talk',
  timestamp: '2026-05-18 오후 3:42',
};

// ─── 장면 프레임 구간 ────────────────────────────────────────────────────────
// Scene 1: 0~180   (0~6s)   KakaoFrame intro
// Scene 2: 180~330 (6~11s)  RadarBadge 분류
// Scene 3: 330~480 (11~16s) Gate Block 차단
// Scene 4: 480~660 (16~22s) TelegramFrame 알림
// Scene 5: 660~900 (22~30s) KakaoFrame 수동 답변 + outro

// ─── 색상 상수 ─────────────────────────────────────────────────────────────

const BG_PAGE      = '#FAF8F4';
const STOP_RED     = '#C8623A';
const GREEN_ACCENT = '#2D8A4F';
const TEXT_DARK    = '#1A1A1A';
const TEXT_MUTED   = '#666666';
const SUBTITLE_BG  = 'rgba(26,26,26,0.72)';

// ─── 유틸: 장면 opacity 계산 (진입 12f fade-in, 퇴장 12f fade-out) ─────────

function sceneOpacity(
  frame: number,
  startFrame: number,
  endFrame: number,
  fadeIn = 12,
  fadeOut = 12,
): number {
  // fadeIn/fadeOut 가 0 이면 interpolate inputRange 가 [x, x] = 같은 끝값 →
  // Remotion strict 검증 throw. 0 케이스는 step function 으로 short-circuit.
  const inVal = fadeIn > 0
    ? interpolate(frame, [startFrame, startFrame + fadeIn], [0, 1], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : (frame >= startFrame ? 1 : 0);
  const outVal = fadeOut > 0
    ? interpolate(frame, [endFrame - fadeOut, endFrame], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      })
    : (frame < endFrame ? 1 : 0);
  return Math.min(inVal, outVal);
}

// ─── GateBlock (V2 전용 inline 컴포넌트) ──────────────────────────────────

const CHECK_ITEMS: Array<{ label: string; pass: boolean }> = [
  { label: 'strength ≥ medium',       pass: true  },
  { label: 'category != unknown',      pass: true  },
  { label: 'source is trusted',        pass: true  },
  { label: 'reply template exists',    pass: true  },
  { label: 'decisionType ≠ guardrail', pass: false },
];

const GateBlock: React.FC<{ revealAt: number }> = ({ revealAt }) => {
  // revealAt 0→0.25: 패널 fade-in / 0.25→1: 각 항목 순차 등장
  const panelOpacity = interpolate(revealAt, [0, 0.25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panelTranslateY = interpolate(revealAt, [0, 0.25], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // STOP 사인: 마지막 항목(FAIL) 이후 등장
  const stopOpacity = interpolate(revealAt, [0.75, 1.0], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const stopScale = interpolate(revealAt, [0.75, 1.0], [0.6, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        opacity: panelOpacity,
        transform: `translateY(${panelTranslateY}px)`,
        width: '100%',
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        border: `2px solid ${STOP_RED}`,
        background: '#FAFAFA',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: STOP_RED,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <span style={{ fontSize: 32 }}>🚫</span>
        <div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 18,
              fontWeight: 700,
              opacity: 0.85,
              letterSpacing: 1,
            }}
          >
            AUTO-REPLY GATE
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 30, fontWeight: 900 }}>
            5조건 검사
          </div>
        </div>
        {/* HITL required 뱃지 */}
        <div
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.22)',
            borderRadius: 24,
            padding: '8px 18px',
            color: '#FFFFFF',
            fontSize: 20,
            fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          HITL required
        </div>
      </div>

      {/* 조건 목록 */}
      <div style={{ padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CHECK_ITEMS.map((item, idx) => {
          const itemOpacity = interpolate(
            revealAt,
            [0.25 + idx * 0.1, 0.25 + idx * 0.1 + 0.12],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          );
          return (
            <div
              key={item.label}
              style={{
                opacity: itemOpacity,
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '12px 16px',
                borderRadius: 10,
                background: item.pass ? '#EBF7EF' : '#FDECEA',
                border: `1px solid ${item.pass ? '#A8D9B8' : '#F0B0A0'}`,
              }}
            >
              <span style={{ fontSize: 24, flexShrink: 0 }}>{item.pass ? '✅' : '❌'}</span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: 22,
                  fontWeight: 700,
                  color: item.pass ? '#1A6634' : STOP_RED,
                  flex: 1,
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: item.pass ? '#2D8A4F' : STOP_RED,
                  letterSpacing: 0.5,
                }}
              >
                {item.pass ? 'PASS' : 'FAIL → STOP'}
              </span>
            </div>
          );
        })}
      </div>

      {/* STOP 사인 */}
      <div
        style={{
          opacity: stopOpacity,
          transform: `scale(${stopScale})`,
          margin: '0 24px 24px',
          padding: '20px',
          borderRadius: 12,
          background: STOP_RED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        <span style={{ fontSize: 40 }}>🛑</span>
        <div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 28,
              fontWeight: 900,
              letterSpacing: 1,
            }}
          >
            AUTO-REPLY 차단
          </div>
          <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 20, marginTop: 4 }}>
            guardrail 감지 → 운영자 HITL 검토 필요
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── 자막 컴포넌트 ──────────────────────────────────────────────────────────

const Subtitle: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 48,
      left: '50%',
      transform: 'translateX(-50%)',
      opacity,
      background: SUBTITLE_BG,
      borderRadius: 10,
      padding: '10px 28px',
      color: '#FFFFFF',
      fontSize: 26,
      fontWeight: 700,
      letterSpacing: 0.3,
      whiteSpace: 'nowrap',
      fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
      backdropFilter: 'blur(4px)',
    }}
  >
    {text}
  </div>
);

// ─── Outro 레이어 (Scene 5 마지막 30f) ────────────────────────────────────

const OutroOverlay: React.FC<{ opacity: number }> = ({ opacity }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      opacity,
      background: 'rgba(26,26,26,0.88)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'column',
      gap: 24,
      pointerEvents: 'none',
    }}
  >
    <div
      style={{
        color: '#FFFFFF',
        fontSize: 72,
        fontWeight: 900,
        letterSpacing: 0.5,
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        textAlign: 'center',
      }}
    >
      위험·고가치 CS 는 사람이 판단
    </div>
    <div
      style={{
        color: 'rgba(255,255,255,0.65)',
        fontSize: 36,
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        textAlign: 'center',
      }}
    >
      PMF Signal Radar — HITL 검토 플로우
    </div>
  </div>
);

// ─── HitlDemo (메인) ────────────────────────────────────────────────────────

export const HitlDemo: React.FC = () => {
  const frame = useCurrentFrame();

  // ── Scene 1: 0~180 KakaoFrame intro ──
  const s1Op = sceneOpacity(frame, 0, 180);
  // inbound 메시지: 60f 이후부터 등장
  const inboundReveal = interpolate(frame, [60, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene 2: 180~330 RadarBadge 분류 ──
  const s2Op = sceneOpacity(frame, 180, 330);
  const badgeFadeIn = interpolate(frame, [192, 240], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene 3: 330~480 GateBlock ──
  const s3Op = sceneOpacity(frame, 330, 480);
  // GateBlock revealAt: 0→1 을 [342, 468] 프레임에 매핑
  const gateRevealAt = interpolate(frame, [342, 468], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 좌측 소형 KakaoFrame: Scene 3 시작과 함께 fade-in
  const s3KakaoOp = interpolate(frame, [330, 360], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene 4: 480~660 TelegramFrame ──
  const s4Op = sceneOpacity(frame, 480, 660);
  // TelegramFrame revealAt: [492, 630] 에 매핑
  const tgRevealAt = interpolate(frame, [492, 630], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // 좌측 소형 RadarBadge: Scene 4 진입과 함께
  const s4BadgeFade = interpolate(frame, [480, 510], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene 5: 660~900 수동 답변 ──
  const s5Op = sceneOpacity(frame, 660, 900, 12, 0);
  // outbound 메시지: 780f 이후 등장
  const outboundReveal = interpolate(frame, [780, 816], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // outro 오버레이: 870~900 (마지막 1초)
  const outroOp = interpolate(frame, [870, 900], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
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
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        color: TEXT_DARK,
        overflow: 'hidden',
      }}
    >
      {/* ────────────────────────────────────────────────────────────────────
          Scene 1: KakaoFrame intro (0~180)
          레이아웃: 중앙 배치 KakaoFrame (넓게)
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s1Op,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '100px 120px 160px',
        }}
      >
        {/* 배경 라벨 */}
        <div
          style={{
            position: 'absolute',
            top: 60,
            left: 200,
            right: 200,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              background: '#2D8A4F18',
              border: '1px solid #2D8A4F40',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 24,
              fontWeight: 700,
              color: GREEN_ACCENT,
            }}
          >
            Channel Talk · B2B 리드 인바운드
          </div>
          <div
            style={{
              background: '#F5F5F5',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 22,
              color: TEXT_MUTED,
              fontWeight: 600,
            }}
          >
            inq-029
          </div>
        </div>

        <div style={{ width: 1200, height: 580 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={inboundReveal}
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 2: RadarBadge 분류 (180~330)
          레이아웃: 중앙 RadarBadge + 좌우 설명 라벨
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
          gap: 40,
          padding: '80px 200px',
        }}
      >
        {/* 상단 분류 타이틀 */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 700,
            color: TEXT_MUTED,
            letterSpacing: 0.3,
          }}
        >
          PMF Radar 자동 분류 결과
        </div>

        <div style={{ width: 900 }}>
          <RadarBadge
            category={CLASSIFICATION.category}
            categoryLabel={CLASSIFICATION.categoryLabel}
            strength={CLASSIFICATION.strength}
            color={CLASSIFICATION.color}
            decisionType={CLASSIFICATION.decisionType}
            source={CLASSIFICATION.source}
            fadeIn={badgeFadeIn}
          />
        </div>

        {/* 분류 결과 설명 */}
        <div
          style={{
            display: 'flex',
            gap: 20,
            opacity: interpolate(frame, [240, 270], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {[
            { label: '카테고리', value: 'privacy', color: GREEN_ACCENT },
            { label: '신호 강도', value: 'strong',  color: GREEN_ACCENT },
            { label: '결정 유형', value: 'guardrail', color: STOP_RED },
          ].map(({ label, value, color }) => (
            <div
              key={label}
              style={{
                background: '#FFFFFF',
                border: `1px solid ${color}40`,
                borderRadius: 10,
                padding: '10px 20px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
              }}
            >
              <div style={{ fontSize: 20, color: TEXT_MUTED, fontWeight: 600, marginBottom: 6 }}>
                {label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: 'monospace' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 3: Gate Block (330~480)
          레이아웃: 좌측 소형 KakaoFrame + 우측 GateBlock 강조
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s3Op,
          display: 'flex',
          alignItems: 'center',
          gap: 48,
          padding: '80px 80px',
        }}
      >
        {/* 좌측 소형 KakaoFrame */}
        <div style={{ width: 480, height: 500, opacity: s3KakaoOp, flexShrink: 0 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={1}
          />
        </div>

        {/* 화살표 */}
        <div
          style={{
            opacity: s3KakaoOp,
            fontSize: 36,
            color: STOP_RED,
            fontWeight: 900,
            flexShrink: 0,
          }}
        >
          →
        </div>

        {/* 우측 GateBlock */}
        <div style={{ flex: 1 }}>
          <GateBlock revealAt={gateRevealAt} />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 4: TelegramFrame 알림 (480~660)
          레이아웃: 좌측 소형 RadarBadge + 우측 TelegramFrame 강조
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s4Op,
          display: 'flex',
          alignItems: 'center',
          gap: 48,
          padding: '80px 80px',
        }}
      >
        {/* 좌측 소형 RadarBadge */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <div style={{ marginBottom: 16, opacity: s4BadgeFade }}>
            <div
              style={{
                fontSize: 22,
                color: TEXT_MUTED,
                fontWeight: 600,
                marginBottom: 12,
                letterSpacing: 0.3,
              }}
            >
              분류 결과 (HITL 트리거)
            </div>
            <RadarBadge
              category={CLASSIFICATION.category}
              categoryLabel={CLASSIFICATION.categoryLabel}
              strength={CLASSIFICATION.strength}
              color={CLASSIFICATION.color}
              decisionType={CLASSIFICATION.decisionType}
              source={CLASSIFICATION.source}
              fadeIn={s4BadgeFade}
            />
          </div>

          {/* HITL 플로우 화살표 */}
          <div
            style={{
              opacity: interpolate(frame, [510, 540], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '16px 0',
            }}
          >
            <div style={{ width: 2, height: 32, background: STOP_RED, borderRadius: 2 }} />
            <div style={{ fontSize: 20, color: STOP_RED }}>▼</div>
            <div
              style={{
                background: STOP_RED + '18',
                border: `1px solid ${STOP_RED}40`,
                borderRadius: 8,
                padding: '10px 18px',
                fontSize: 20,
                fontWeight: 700,
                color: STOP_RED,
                textAlign: 'center',
              }}
            >
              guardrail → HITL required<br />운영자 Telegram 알림 전송
            </div>
          </div>
        </div>

        {/* 화살표 */}
        <div style={{ fontSize: 36, color: '#5288C1', fontWeight: 900, flexShrink: 0, opacity: s4BadgeFade }}>
          →
        </div>

        {/* 우측 TelegramFrame */}
        <div style={{ flex: 1, height: 520 }}>
          <TelegramFrame
            botName="PMF Radar P2"
            chatLabel="kimsanguine (운영자)"
            signal={TELEGRAM_SIGNAL}
            revealAt={tgRevealAt}
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 5: KakaoFrame 수동 답변 (660~900)
          레이아웃: 중앙 KakaoFrame (inbound + outbound 모두 표시)
                   마지막 30f: Outro 오버레이
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
          padding: '80px 80px',
        }}
      >
        {/* 상단 운영자 라벨 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            opacity: interpolate(frame, [660, 690], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div
            style={{
              background: '#2D8A4F18',
              border: '1px solid #2D8A4F40',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 24,
              fontWeight: 700,
              color: GREEN_ACCENT,
            }}
          >
            운영자 직접 검토 · 수동 답변
          </div>
          <div
            style={{
              background: '#F5F5F5',
              borderRadius: 8,
              padding: '10px 20px',
              fontSize: 22,
              color: TEXT_MUTED,
              fontWeight: 600,
            }}
          >
            kimsanguine
          </div>
        </div>

        <div style={{ width: 1200, height: 580 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE, OUTBOUND_REPLY]}
            revealUpTo={1 + outboundReveal}
          />
        </div>
      </div>

      {/* Outro 오버레이 (870~900) */}
      <OutroOverlay opacity={outroOp} />

      {/* ────────────────────────────────────────────────────────────────────
          자막 (하단 고정, 장면별 fade)
      ──────────────────────────────────────────────────────────────────── */}
      <Subtitle text="Channel Talk 로 B2B 리드 문의 도착" opacity={sub1Op} />
      <Subtitle text="PMF Radar 분류: privacy / strong / guardrail" opacity={sub2Op} />
      <Subtitle text="Auto-Reply Gate 차단 → HITL required" opacity={sub3Op} />
      <Subtitle text="운영자 Telegram 으로 알림 전송" opacity={sub4Op} />
      <Subtitle text="운영자가 직접 검토 후 응답" opacity={sub5Op} />
    </AbsoluteFill>
  );
};
