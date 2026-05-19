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

// R18.2: Scene 3 메시지 — wrapper word-break: keep-all 적용으로 한국어 어절 단위 break 보장
// wrapper 900 + keep-all → "사내 데이터 보안 검토 / 필요합니다" 자연스러운 어절 break
const INBOUND_SUMMARY: KakaoMessage = {
  author: 'B2B 리드 — 사내 데이터 보안 검토',
  text: '사내 데이터 보안 검토 필요합니다',
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
// Round 9: fontSize 와 element sizing 비례 정합 재구성
//   - item row gap: 20→28 (fontSize 44 × 0.64)
//   - item row padding: 20×28 → 22×32 (fontSize 44 × 0.5~0.73)
//   - header emoji: 96 유지, 헤더 padding: 32×48 → 36×56 (emoji 비례)
//   - STOP section padding: 32→40, gap: 24→32

const CHECK_ITEMS: Array<{ label: string; pass: boolean }> = [
  { label: 'strength ≥ medium',       pass: true  },
  { label: 'category != unknown',      pass: true  },
  { label: 'source is trusted',        pass: true  },
  { label: 'reply template exists',    pass: true  },
  { label: 'decisionType ≠ guardrail', pass: false },
];

const GateBlock: React.FC<{ revealAt: number }> = ({ revealAt }) => {
  const panelOpacity = interpolate(revealAt, [0, 0.25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const panelTranslateY = interpolate(revealAt, [0, 0.25], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

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
        borderRadius: 22,
        overflow: 'hidden',
        boxShadow: '0 6px 24px rgba(0,0,0,0.14)',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        border: `2px solid ${STOP_RED}`,
        background: '#FAFAFA',
      }}
    >
      {/* 헤더 — padding 비례 확대 (emoji 96 기준 × 0.375 = 36px top/bottom) */}
      <div
        style={{
          background: STOP_RED,
          padding: '36px 56px',
          display: 'flex',
          alignItems: 'center',
          gap: 28,
        }}
      >
        <span style={{ fontSize: 88, flexShrink: 0 }}>🚫</span>
        <div>
          <div
            style={{
              color: '#FFFFFF',
              fontSize: 34,
              fontWeight: 700,
              opacity: 0.85,
              letterSpacing: 1,
            }}
          >
            AUTO-REPLY GATE
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 58, fontWeight: 900 }}>
            5조건 검사
          </div>
        </div>
        {/* HITL required 뱃지 — fontSize 44 × padding 16×36 (ratio 0.36~0.82) */}
        <div
          style={{
            marginLeft: 'auto',
            background: 'rgba(255,255,255,0.22)',
            borderRadius: 32,
            padding: '16px 36px',
            color: '#FFFFFF',
            fontSize: 44,
            fontWeight: 800,
            letterSpacing: 0.5,
          }}
        >
          HITL required
        </div>
      </div>

      {/* 조건 목록 — gap/padding 비례 조정 */}
      <div style={{ padding: '24px 44px', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                gap: 24,
                // padding: fontSize 42 기준 × 0.52~0.76 = 22×32
                padding: '22px 32px',
                borderRadius: 14,
                background: item.pass ? '#EBF7EF' : '#FDECEA',
                border: `1px solid ${item.pass ? '#A8D9B8' : '#F0B0A0'}`,
              }}
            >
              {/* emoji: fontSize 42로 맞춤 (row height 확보) */}
              <span style={{ fontSize: 42, flexShrink: 0 }}>{item.pass ? '✅' : '❌'}</span>
              <span
                style={{
                  fontFamily: 'monospace',
                  // fontSize: 44 유지 (±20% 범위 내)
                  fontSize: 42,
                  fontWeight: 700,
                  color: item.pass ? '#1A6634' : STOP_RED,
                  flex: 1,
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 800,
                  color: item.pass ? '#2D8A4F' : STOP_RED,
                  letterSpacing: 0.5,
                  // PASS/FAIL 레이블 최소 너비 보장
                  minWidth: 180,
                  textAlign: 'right',
                }}
              >
                {item.pass ? 'PASS' : 'FAIL → STOP'}
              </span>
            </div>
          );
        })}
      </div>

      {/* STOP 사인 — padding/gap 비례 재구성 */}
      <div
        style={{
          opacity: stopOpacity,
          transform: `scale(${stopScale})`,
          margin: '0 44px 40px',
          // padding: fontSize 54 기준 × 0.74 = 40px
          padding: '36px',
          borderRadius: 18,
          background: STOP_RED,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <span style={{ fontSize: 88, flexShrink: 0 }}>🛑</span>
        <div>
          <div
            style={{
              color: '#FFFFFF',
              // fontSize: 56→54 (−3.6%, 범위 내)
              fontSize: 54,
              fontWeight: 900,
              letterSpacing: 1,
            }}
          >
            AUTO-REPLY 차단
          </div>
          <div style={{ color: 'rgba(255,255,255,0.82)', fontSize: 38, marginTop: 6 }}>
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
      fontSize: 52,
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
        fontSize: 144,
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
        fontSize: 72,
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
  const gateRevealAt = interpolate(frame, [342, 468], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const s3KakaoOp = interpolate(frame, [330, 360], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene 4: 480~660 TelegramFrame ──
  const s4Op = sceneOpacity(frame, 480, 660);
  // Round 14: TelegramFrame 카드 등장 시점 강력 앞당김 (R10/R13 stale render 문제 해소)
  // cardOpacity = revealAt[0.4,0.8] 임계 → 420f(14s) 부터 카드 등장 보장
  const tgRevealAt = interpolate(frame, [400, 480], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  // R14 cache bust marker — bundle hash 강제 변경 (Remotion cache deep clear)
  const _r14 = 'cache-bust-2026-05-19';
  // R18.3: Scene 3 KakaoFrame width 700 + keep-all (GateBlock 폭 1064 회복, 좌우 균형)
  const _r18 = 'r18-3-v2-scene3-balanced-2026-05-19';
  const s4BadgeFade = interpolate(frame, [480, 510], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Scene 5: 660~900 수동 답변 ──
  const s5Op = sceneOpacity(frame, 660, 900, 12, 0);
  const outboundReveal = interpolate(frame, [780, 816], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
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
          Round 9: KakaoFrame wrapper 1400×720 유지
          (말풍선 maxWidth=76%는 shared 내부 — wrapper 크기로 말풍선 여유 확보)
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s1Op,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '60px 80px 120px',
        }}
      >
        {/* 배경 라벨 */}
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 120,
            right: 120,
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
              // padding: fontSize 48 기준 × 0.21~0.42 = 10×20 (기존 유지)
              padding: '10px 20px',
              fontSize: 48,
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
              fontSize: 44,
              color: TEXT_MUTED,
              fontWeight: 600,
            }}
          >
            inq-029
          </div>
        </div>

        {/* KakaoFrame wrapper: 1400×720 — 말풍선 여유 충분 */}
        <div style={{ width: 1400, height: 720 }}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={inboundReveal}
          />
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 2: RadarBadge 분류 (180~330)
          Round 9: RadarBadge wrapper 1100→1000 (categoryLabel 72px 기준
          내부 상단 padding 18×24 + emoji 72 + text 영역 여유 확보)
          분류 결과 카드: padding 비례 확대 (value fontSize 52 기준 × 0.5~0.62)
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
          gap: 44,
          padding: '60px 120px',
        }}
      >
        {/* 상단 분류 타이틀 */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 700,
            color: TEXT_MUTED,
            letterSpacing: 0.3,
          }}
        >
          PMF Radar 자동 분류 결과
        </div>

        {/* RadarBadge wrapper: 너비 1000으로 조정 (categoryLabel 72px 내부 padding 비례) */}
        <div style={{ width: 1000 }}>
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

        {/* 분류 결과 설명 카드 — padding/gap 비례 재구성 */}
        <div
          style={{
            display: 'flex',
            gap: 28,
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
                borderRadius: 16,
                // padding: label 40 / value 52 기준 → 20×40 (value × 0.38~0.77)
                padding: '20px 40px',
                textAlign: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
                // 최소 너비: value 텍스트 길이 보장 (guardrail = 8자 × 52 × 0.55 ≈ 228px)
                minWidth: 280,
              }}
            >
              <div style={{ fontSize: 38, color: TEXT_MUTED, fontWeight: 600, marginBottom: 10 }}>
                {label}
              </div>
              <div style={{ fontSize: 52, fontWeight: 900, color, fontFamily: 'monospace' }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 3: Gate Block (330~480)
          Round 9: 좌측 소형 KakaoFrame 너비 560→500 (GateBlock 영역 확보)
          GateBlock 항목 비례는 GateBlock 컴포넌트 내부에서 처리
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s3Op,
          display: 'flex',
          alignItems: 'center',
          gap: 36,
          padding: '56px 56px',
        }}
      >
        {/* 좌측 소형 KakaoFrame — R18.3: wrapper 900→700 (GateBlock 폭 회복) + keep-all 유지
            900 일 때 GateBlock 폭 764 가 영문 라벨 두~세 줄로 깨짐 → 700 으로 줄여 GateBlock 1064 회복
            wrapper 700 × bubble 76% = 532 → padding 60 차감 → text 472px
            메시지 "사내 데이터 보안 검토 / 필요합니다" 어절 단위 두 줄 자연 break */}
        <div
          style={{
            width: 700,
            height: 560,
            opacity: s3KakaoOp,
            flexShrink: 0,
            wordBreak: 'keep-all',
            overflowWrap: 'break-word',
          }}
        >
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_SUMMARY]}
            revealUpTo={1}
          />
        </div>

        {/* 화살표 */}
        <div
          style={{
            opacity: s3KakaoOp,
            fontSize: 72,
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
          Round 9: TelegramFrame 내부 label width=90 이 label fontSize=40 대비
          좁음 (수신 시각 4자 × 40px ≈ 160px 필요) → shared 건드릴 수 없으므로
          TelegramFrame wrapper 를 scale(1.1) 로 확대해 내부 grid 비례 보정.
          좌측 RadarBadge wrapper 너비 520→480 으로 조정.
      ──────────────────────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: s4Op,
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          padding: '60px 60px',
        }}
      >
        {/* 좌측 소형 RadarBadge */}
        <div style={{ width: 480, flexShrink: 0 }}>
          <div style={{ marginBottom: 16, opacity: s4BadgeFade }}>
            <div
              style={{
                fontSize: 42,
                color: TEXT_MUTED,
                fontWeight: 600,
                marginBottom: 14,
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
              gap: 8,
              padding: '18px 0',
            }}
          >
            <div style={{ width: 2, height: 36, background: STOP_RED, borderRadius: 2 }} />
            <div style={{ fontSize: 40, color: STOP_RED }}>▼</div>
            <div
              style={{
                background: STOP_RED + '18',
                border: `1px solid ${STOP_RED}40`,
                borderRadius: 12,
                // padding: fontSize 38 기준 × 0.42~0.74 = 16×28
                padding: '16px 28px',
                fontSize: 38,
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
        <div style={{ fontSize: 72, color: '#5288C1', fontWeight: 900, flexShrink: 0, opacity: s4BadgeFade }}>
          →
        </div>

        {/* 우측 TelegramFrame — height 860으로 확대 (내용물 총 높이 ~800px 수용) */}
        <div style={{ flex: 1, height: 860, position: 'relative' }}>
          <div
            style={{
              width: '100%',
              height: '100%',
              // TelegramFrame 내부 label width=90 이 fontSize=40 대비 좁으므로
              // wrapper 를 scale 확대해 grid cell 여유 확보
              transform: 'scale(1.0)',
              transformOrigin: 'center center',
            }}
          >
            <TelegramFrame
              botName="PMF Radar P2"
              chatLabel="kimsanguine (운영자)"
              signal={TELEGRAM_SIGNAL}
              revealAt={tgRevealAt}
            />
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────────────────
          Scene 5: KakaoFrame 수동 답변 (660~900)
          Round 9: KakaoFrame wrapper 1400×720 유지
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
          gap: 28,
          padding: '60px 60px',
        }}
      >
        {/* 상단 운영자 라벨 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
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
              fontSize: 48,
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
              fontSize: 44,
              color: TEXT_MUTED,
              fontWeight: 600,
            }}
          >
            kimsanguine
          </div>
        </div>

        <div style={{ width: 1400, height: 720 }}>
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
