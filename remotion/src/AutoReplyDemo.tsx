import React from 'react';
import {
  AbsoluteFill,
  Easing,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { KakaoFrame, KakaoMessage } from './shared/KakaoFrame';
import { RadarBadge } from './shared/RadarBadge';

// ─── fixture (inq-001 카논) ─────────────────────────────────────────────────

const INBOUND_MESSAGE: KakaoMessage = {
  author: '수강생 — Claude Code 첫 설치',
  text: '맥에서 설치하다가 zsh: command not found가 떠서 40분째 멈춰있어요. 강의는 좋은데 여기서 막히니까 시작도 못 하겠어요.',
  time: '오후 2:14',
  type: 'inbound',
};

const OUTBOUND_REPLY: KakaoMessage = {
  author: 'PMF Radar (AI 자동)',
  text: '사용 중인 OS와 에러 문구를 확인한 뒤, 해당 체크포인트부터 안내하겠습니다.',
  time: '오후 2:14',
  type: 'outbound',
};

const CHANNEL_LABEL = '카카오톡 오픈채팅';

const CLASSIFICATION = {
  category: 'setup',
  categoryLabel: '설치 실패',
  strength: 'strong' as const,
  color: '#C8623A',
  decisionType: 'build' as const,
  source: 'mock_kakao',
};

const GATE_CONDITIONS = [
  { label: 'category 가 반복 가능 (setup/practice_blocker)', pass: true },
  { label: 'strength = strong (증거 충분)', pass: true },
  { label: 'decisionType ≠ guardrail (privacy/refund 아님)', pass: true },
  { label: '오프타임 아님 (22:00–08:00 KST 외)', pass: true },
  { label: 'daily_send_cap 미초과 (오늘 < 20건)', pass: true },
];

// ─── 색상 상수 ─────────────────────────────────────────────────────────────

const BG = '#FAF8F4';
const DARK = '#1A1A1A';
const CORAL = '#C8623A';
const NAVY = '#1F4E79';
const TEAL = '#0E6B56';
const FONT = '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif';

// ─── 자막 컴포넌트 (V1 전용 inline) ────────────────────────────────────────

const Subtitle: React.FC<{ text: string; opacity: number }> = ({ text, opacity }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 120,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      opacity,
    }}
  >
    <div
      style={{
        background: 'rgba(0,0,0,0.62)',
        borderRadius: 10,
        padding: '12px 32px',
        color: '#FFFFFF',
        fontSize: 28,
        fontWeight: 600,
        fontFamily: FONT,
        letterSpacing: 0.3,
        textShadow: '0 1px 4px rgba(0,0,0,0.5)',
        maxWidth: 1400,
        textAlign: 'center',
        lineHeight: 1.4,
      }}
    >
      {text}
    </div>
  </div>
);

// ─── GateChecklist (V1 전용 inline) ─────────────────────────────────────────

const GateChecklist: React.FC<{
  conditions: Array<{ label: string; pass: boolean }>;
  revealAt: number; // 0~1 progress (전체 조건 대비 진행률)
}> = ({ conditions, revealAt }) => {
  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 800,
          color: NAVY,
          letterSpacing: 1.2,
          marginBottom: 6,
          fontFamily: FONT,
          textTransform: 'uppercase',
        }}
      >
        Auto-Reply Gate — 통과 조건
      </div>
      {conditions.map((cond, i) => {
        // 조건 i는 revealAt > i/conditions.length 가 되는 순간부터 등장
        const threshold = i / conditions.length;
        const raw = (revealAt - threshold) / (1 / conditions.length);
        const itemProgress = Math.min(1, Math.max(0, raw));
        const opacity = itemProgress;
        const translateX = interpolate(itemProgress, [0, 1], [24, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              opacity,
              transform: `translateX(${translateX}px)`,
              background: cond.pass ? '#E8F5E9' : '#FFEBEE',
              border: `1.5px solid ${cond.pass ? '#66BB6A' : '#EF5350'}`,
              borderRadius: 10,
              padding: '12px 16px',
            }}
          >
            <span
              style={{
                fontSize: 22,
                lineHeight: 1,
                flexShrink: 0,
                color: cond.pass ? '#388E3C' : '#C62828',
              }}
            >
              {cond.pass ? '✓' : '✗'}
            </span>
            <span
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: DARK,
                fontFamily: FONT,
                lineHeight: 1.4,
              }}
            >
              {cond.label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// ─── Outro 패널 (V1 전용 inline) ────────────────────────────────────────────

const OutroPanel: React.FC<{ progress: number }> = ({ progress }) => {
  const titleOpacity = interpolate(progress, [0, 0.3], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const titleY = interpolate(progress, [0, 0.3], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const subOpacity = interpolate(progress, [0.2, 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const badgeOpacity = interpolate(progress, [0.45, 0.75], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const badgeScale = interpolate(progress, [0.45, 0.75], [0.8, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        padding: '0 60px',
      }}
    >
      {/* 메인 카피 */}
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            color: TEAL,
            fontFamily: FONT,
            lineHeight: 1.25,
            letterSpacing: -0.5,
          }}
        >
          AI 자동 응답으로
        </div>
        <div
          style={{
            fontSize: 42,
            fontWeight: 900,
            color: DARK,
            fontFamily: FONT,
            lineHeight: 1.25,
          }}
        >
          운영자 시간 절약
        </div>
      </div>

      {/* 서브 설명 */}
      <div
        style={{
          opacity: subOpacity,
          fontSize: 20,
          color: '#555555',
          fontFamily: FONT,
          textAlign: 'center',
          lineHeight: 1.6,
          maxWidth: 560,
        }}
      >
        반복 문의를 5조건 Auto-Reply Gate 로 필터링,
        <br />
        담당자 개입 없이 즉시 응답
      </div>

      {/* hplan badge */}
      <div
        style={{
          opacity: badgeOpacity,
          transform: `scale(${badgeScale})`,
          background: NAVY,
          borderRadius: 14,
          padding: '14px 28px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span style={{ fontSize: 24 }}>⚡</span>
        <span
          style={{
            color: '#FFFFFF',
            fontSize: 18,
            fontWeight: 800,
            fontFamily: FONT,
            letterSpacing: 0.5,
          }}
        >
          hplan — PMF Signal Radar
        </span>
      </div>
    </div>
  );
};

// ─── 우측 패널 컨테이너 ────────────────────────────────────────────────────

const RightPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 960,
      width: 960,
      height: 960, // 자막 120px 제외
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 64px',
    }}
  >
    {children}
  </div>
);

// ─── 섹션 헤더 ─────────────────────────────────────────────────────────────

const SectionLabel: React.FC<{ text: string; color?: string }> = ({
  text,
  color = NAVY,
}) => (
  <div
    style={{
      fontSize: 13,
      fontWeight: 800,
      color,
      letterSpacing: 2,
      marginBottom: 20,
      fontFamily: FONT,
      textTransform: 'uppercase',
      alignSelf: 'flex-start',
    }}
  >
    {text}
  </div>
);

// ─── AutoReplyDemo (메인) ───────────────────────────────────────────────────

export const AutoReplyDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ── 전체 자막 opacity (화면 전환 시 fade) ──────────────────────────────
  const subtitleOpacity = interpolate(
    frame,
    [0, 15, 870, 900],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── KakaoFrame 패널 opacity (scene 1~4: 0~720) ─────────────────────────
  const kakaoOpacity = interpolate(frame, [0, 20, 700, 730], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // ── Outro 패널 opacity (scene 5: 720~900) ──────────────────────────────
  const outroOpacity = interpolate(frame, [720, 750], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        background: BG,
        fontFamily: FONT,
        color: DARK,
      }}
    >
      {/* ── 좌측 KakaoFrame (scene 1~4) ──────────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 960,
          height: 960,
          padding: '60px 40px 60px 60px',
          opacity: kakaoOpacity,
        }}
      >
        {/* scene 1: inbound만 */}
        <Sequence from={0} durationInFrames={360} premountFor={30}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={(() => {
              const localProgress = interpolate(frame, [30, 120], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
                easing: Easing.out(Easing.quad),
              });
              return localProgress;
            })()}
          />
        </Sequence>

        {/* scene 2~3: inbound 고정 표시 */}
        <Sequence from={360} durationInFrames={360} premountFor={30}>
          <KakaoFrame
            channelLabel={CHANNEL_LABEL}
            messages={[INBOUND_MESSAGE]}
            revealUpTo={1}
          />
        </Sequence>

        {/* scene 4: outbound 답변 도착 */}
        <Sequence from={540} durationInFrames={180} premountFor={30}>
          {(() => {
            const replyProgress = interpolate(frame, [570, 660], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.quad),
            });
            return (
              <KakaoFrame
                channelLabel={CHANNEL_LABEL}
                messages={[INBOUND_MESSAGE, OUTBOUND_REPLY]}
                revealUpTo={1 + replyProgress}
              />
            );
          })()}
        </Sequence>
      </div>

      {/* ── 우측 패널 — scene 1: 빈 공간에 채널 라벨 ────────────────────── */}
      <Sequence from={0} durationInFrames={180} premountFor={15}>
        {(() => {
          const localFrame = frame;
          const labelOpacity = interpolate(localFrame, [15, 60], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <RightPanel>
              <div
                style={{
                  opacity: labelOpacity,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontSize: 48,
                    fontWeight: 900,
                    color: NAVY,
                    fontFamily: FONT,
                    lineHeight: 1.2,
                    marginBottom: 16,
                  }}
                >
                  카카오 오픈채팅
                </div>
                <div
                  style={{
                    fontSize: 24,
                    color: '#666666',
                    fontFamily: FONT,
                    fontWeight: 500,
                  }}
                >
                  일반 문의 실시간 수신
                </div>
              </div>
            </RightPanel>
          );
        })()}
      </Sequence>

      {/* ── 우측 패널 — scene 2: RadarBadge 분류 ────────────────────────── */}
      <Sequence from={180} durationInFrames={180} premountFor={15}>
        {(() => {
          const localFrame = frame - 180;
          const badgeFadeIn = interpolate(localFrame, [15, 60], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.quad),
          });
          return (
            <RightPanel>
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <SectionLabel text="PMF Radar — 자동 분류 결과" color={CORAL} />
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
            </RightPanel>
          );
        })()}
      </Sequence>

      {/* ── 우측 패널 — scene 3: Auto-Reply Gate 5조건 ───────────────────── */}
      <Sequence from={360} durationInFrames={180} premountFor={15}>
        {(() => {
          const localFrame = frame - 360;
          // 5조건을 0~120프레임에 걸쳐 순차 등장
          const gateProgress = interpolate(localFrame, [15, 120], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <RightPanel>
              <div
                style={{
                  width: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <GateChecklist
                  conditions={GATE_CONDITIONS}
                  revealAt={gateProgress}
                />
              </div>
            </RightPanel>
          );
        })()}
      </Sequence>

      {/* ── 우측 패널 — scene 4: 답변 완료 안내 ─────────────────────────── */}
      <Sequence from={540} durationInFrames={180} premountFor={15}>
        {(() => {
          const localFrame = frame - 540;
          const panelOpacity = interpolate(localFrame, [10, 45], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          const checkScale = spring({
            frame: localFrame - 30,
            fps,
            config: { damping: 20, stiffness: 200 },
          });
          return (
            <RightPanel>
              <div
                style={{
                  opacity: panelOpacity,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 24,
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: '50%',
                    background: TEAL,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: `scale(${checkScale})`,
                  }}
                >
                  <span style={{ fontSize: 48, color: '#FFFFFF', lineHeight: 1 }}>
                    ✓
                  </span>
                </div>
                <div
                  style={{
                    fontSize: 34,
                    fontWeight: 900,
                    color: TEAL,
                    fontFamily: FONT,
                  }}
                >
                  자동 응답 발송 완료
                </div>
                <div
                  style={{
                    fontSize: 18,
                    color: '#555555',
                    fontFamily: FONT,
                    lineHeight: 1.6,
                  }}
                >
                  운영자 개입 없이
                  <br />
                  2:14 PM 즉시 발송
                </div>
              </div>
            </RightPanel>
          );
        })()}
      </Sequence>

      {/* ── scene 5: Outro (전체 화면 fade-in) ──────────────────────────── */}
      <Sequence from={720} durationInFrames={180} premountFor={15}>
        {(() => {
          const localFrame = frame - 720;
          const outroProgress = interpolate(localFrame, [0, 120], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: Easing.out(Easing.quad),
          });
          return (
            <AbsoluteFill
              style={{
                opacity: outroOpacity,
                background: BG,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {/* 상단 구분선 장식 */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 6,
                  background: `linear-gradient(90deg, ${NAVY} 0%, ${TEAL} 50%, ${CORAL} 100%)`,
                }}
              />
              <OutroPanel progress={outroProgress} />
            </AbsoluteFill>
          );
        })()}
      </Sequence>

      {/* ── 자막 (scene별 Sequence로 swap) ───────────────────────────────── */}
      <div style={{ opacity: subtitleOpacity }}>
        {/* scene 1 자막 */}
        <Sequence from={0} durationInFrames={180} premountFor={10}>
          {(() => {
            const op = interpolate(frame, [15, 45, 150, 180], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <Subtitle
                text="카카오톡 오픈채팅으로 일반 문의 도착"
                opacity={op}
              />
            );
          })()}
        </Sequence>

        {/* scene 2 자막 */}
        <Sequence from={180} durationInFrames={180} premountFor={10}>
          {(() => {
            const op = interpolate(frame - 180, [15, 45, 150, 180], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <Subtitle
                text="PMF Radar 가 자동 분류: setup / strong / build"
                opacity={op}
              />
            );
          })()}
        </Sequence>

        {/* scene 3 자막 */}
        <Sequence from={360} durationInFrames={180} premountFor={10}>
          {(() => {
            const op = interpolate(frame - 360, [15, 45, 150, 180], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <Subtitle
                text="Auto-Reply Gate — 5조건 모두 통과"
                opacity={op}
              />
            );
          })()}
        </Sequence>

        {/* scene 4 자막 */}
        <Sequence from={540} durationInFrames={180} premountFor={10}>
          {(() => {
            const op = interpolate(frame - 540, [15, 45, 150, 180], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <Subtitle
                text="AI 자동 응답 즉시 발송 — 운영자 개입 없음"
                opacity={op}
              />
            );
          })()}
        </Sequence>

        {/* scene 5 자막 */}
        <Sequence from={720} durationInFrames={180} premountFor={10}>
          {(() => {
            const op = interpolate(frame - 720, [15, 45, 150, 180], [0, 1, 1, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            });
            return (
              <Subtitle
                text="hplan PMF Signal Radar — 반복 CS 를 자동화"
                opacity={op}
              />
            );
          })()}
        </Sequence>
      </div>
    </AbsoluteFill>
  );
};
