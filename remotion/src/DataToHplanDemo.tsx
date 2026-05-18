import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import { KakaoFrame, KakaoMessage } from './shared/KakaoFrame';
import { BubbleMap, BubbleCluster } from './shared/BubbleMap';
import { BacklogCard } from './shared/BacklogCard';

// ─── 셀 1/4: Fixture 데이터 ─────────────────────────────────────────────────

const BURST_MESSAGES: (KakaoMessage & { channel: string; category: string })[] = [
  {
    author: '수강생 — 첫 설치',
    text: 'zsh: command not found 떠서 막혀있어요',
    time: '오후 2:14',
    type: 'inbound',
    channel: 'kakao',
    category: 'setup',
  },
  {
    author: '초보 PM',
    text: 'AGENTS.md 왜 중요한지 감은 오는데\n막막해요',
    time: '오후 2:17',
    type: 'inbound',
    channel: 'kakao',
    category: 'concept_confusion',
  },
  {
    author: 'B2B 리드',
    text: '사내 데이터 보안 정책 확인 필요합니다',
    time: '오후 2:21',
    type: 'inbound',
    channel: 'channel_talk',
    category: 'privacy',
  },
  {
    author: '재수강 후보',
    text: '업무별 starter kit 가 있으면\n재수강할 듯해요',
    time: '오후 2:24',
    type: 'inbound',
    channel: 'kakao',
    category: 'retention',
  },
  {
    author: '수강생 — npm 에러',
    text: 'npm install 에러가 났는데 제 문제인지\n강의 문제인지...',
    time: '오후 2:28',
    type: 'inbound',
    channel: 'kakao',
    category: 'setup',
  },
  {
    author: '팀 리드',
    text: '팀원 5명에게 들려주고 싶은데\n결과물 템플릿이 있나요?',
    time: '오후 2:31',
    type: 'inbound',
    channel: 'channel_talk',
    category: 'output_quality',
  },
];

// ── BubbleMap 클러스터 (BubbleMap shared 사용, 비례 재검증) ─────────────────
// SVG viewBox "0 0 1300 560"
// BubbleMap 내부: fontSize = Math.max(40, r×1.04), 건수 fontSize = Math.max(32, r×0.84)
// 수학 검증 (원 직경 = r×2 기준):
//   설치실패 r=110 → d=220, fontSize=max(40,114)=114 → "설치 실패" 4자×114×0.55≈251 > 220
//     → 2자씩 2줄: 각 줄 2자×114×0.55≈125 < 220 ✓ (공백 위치로 분리 불가 → 이름 2자로 단축)
//   PM사고 r=75 → d=150, fontSize=max(40,78)=78 → "PM사고" 4자×78×0.55≈172 > 150
//     → 이름 단축 필요
//   개인정보 r=64 → d=128, fontSize=max(40,67)=67 → "개인정보" 4자×67×0.55≈147 > 128
//   해결책: r를 키우거나 name을 짧게. r 키우는 방향 선택.
//
// 최종 검증 (이름 2~3자 단축 + r 확대):
//   설치실패 r=120 → d=240, "설치실패" 4자 → 짧게 "설치실패"... fontSize=max(40,125)=125
//     → BubbleMap은 단일 행 text이므로 글자수 × fontSize × 0.55로 검증
//     → 4자 × 125 × 0.55 ≈ 275 > 240 → 이름을 "설치실패"(4자) 대신 "설치 실패"(공백 포함)은 더 넓음
//   실용적 해결: r을 충분히 키워서 모든 클러스터가 텍스트를 수용
//     r=130 → fontSize=max(40,135)=135, d=260
//     "설치 실패" 4자(공백 미포함) × 135 × 0.55 ≈ 297 > 260 → 여전히 초과
//   근본 해결: 클러스터 이름을 2자로 제한
//     "설치 실패" 에서 "설치실패" 또는 한자 축약 → 대신 fontSize 줄임
//   최선: BubbleMap shared의 fontSize 계산이 r×1.04라서 r=120 이상에서 너무 큼
//         shared 수정 불가 → r을 작게(≤60) + 이름을 짧게(2~3자)
//
// r ≤ 60 구간:
//   r=60, fontSize=max(40,62)=62, d=120
//   "설치" 2자 × 62 × 0.55 ≈ 68 < 120 ✓
//   건수 "2건" 3자 × max(32,50)=50 × 0.55 ≈ 83 < 120 ✓
//
// 최종 클러스터 (이름 2~3자, r ≤ 68):
//   설치실패 r=68 → fontSize=71, d=136, "설치" 2자×71×0.55≈78 < 136 ✓
//   PM사고  r=55 → fontSize=57, d=110, "PM" 2자×57×0.55≈63 < 110 ✓
//   개인정보 r=52 → fontSize=54, d=104, "보안" 2자×54×0.55≈59 < 104 ✓
//   재방문  r=52 → fontSize=54, d=104, "재방" 2자×54×0.55≈59 < 104 ✓
//   품질판단 r=50 → fontSize=52, d=100, "품질" 2자×52×0.55≈57 < 100 ✓
// 클러스터 간 최소 거리 > r1+r2 검증 (viewBox 1300×560):
//   설치실패(310,280)↔PM사고(620,200): dist=√(310²+80²)≈321 > 68+55=123 ✓
//   설치실패(310,280)↔품질판단(490,430): dist=√(180²+150²)≈234 > 68+50=118 ✓
//   PM사고(620,200)↔개인정보(870,320): dist=√(250²+120²)≈278 > 55+52=107 ✓
//   개인정보(870,320)↔재방문(1040,190): dist=√(170²+130²)≈214 > 52+52=104 ✓
const CLUSTERS: BubbleCluster[] = [
  { x: 310, y: 280, r: 68,  color: '#C8623A', name: '설치',    count: 2 },
  { x: 620, y: 200, r: 55,  color: '#C8623A', name: 'PM',      count: 1 },
  { x: 870, y: 320, r: 52,  color: '#2D7A57', name: '보안',    count: 1 },
  { x: 1040, y: 190, r: 52, color: '#D6A238', name: '재방문',  count: 1 },
  { x: 490, y: 430, r: 50,  color: '#C8623A', name: '품질',    count: 1 },
];

const FOCUS_CLUSTER = {
  name: '설치 실패',
  decision: 'OS별 복구 체크포인트와 에러북을 먼저 만든다',
  push: '첫 설치와 환경 차이에서 강의 시작 전 이탈이 발생',
  anxiety: '내 컴퓨터만 다른 것 같고 시작도 못 한다는 불안',
  priority: 5 as const,
  color: '#C8623A',
};

const PRIORITY_DISTRIBUTION = [
  { priority: 5, count: 2, label: 'Critical (5)' },
  { priority: 4, count: 2, label: 'High (4)' },
  { priority: 3, count: 2, label: 'Medium (3)' },
];

// ─── 셀 2/4: 인라인 컴포넌트 ────────────────────────────────────────────────

// 색상 상수
const BG_PAGE       = '#FAF8F4';
const TEXT_DARK     = '#1A1A1A';
const TEXT_MUTED    = '#5E5850';
const STOP_RED      = '#C8623A';
const KAKAO_YELLOW  = '#FEE500';

// ── PriorityChart (Scene 4 전용 inline) ─────────────────────────────────────
// 수학 검증 (차트 너비 ≈ 750px):
//   bar label "Critical (5)" = 10자 × 40px × 0.55 ≈ 220 < 750 ✓
//   count "2건" = 3자 × 40px × 0.55 ≈ 66 < 750 ✓
//   bar height 40px — fontSize 40 × 1.0 ✓
const PRIORITY_BAR_COLOR: Record<number, string> = {
  5: '#C8623A',
  4: '#E0A445',
  3: '#2D7A57',
};

const PriorityChart: React.FC<{
  data: Array<{ priority: number; count: number; label: string }>;
  revealAt: number;
}> = ({ data, revealAt }) => {
  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        fontFamily: '"Noto Sans KR", sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          color: TEXT_MUTED,
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 8,
          fontFamily: '"JetBrains Mono", "Courier New", monospace',
        }}
      >
        Priority 분포
      </div>
      {data.map((item, i) => {
        const n = data.length;
        const threshold = i / n;
        const barProgress = interpolate(
          revealAt,
          [threshold, Math.min(1, threshold + 1 / n)],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const barWidth = interpolate(barProgress, [0, 1], [0, (item.count / maxCount) * 100]);
        const rowOp = interpolate(barProgress, [0, 0.3], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });

        return (
          <div key={item.priority} style={{ opacity: rowOp }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
              }}
            >
              <span style={{ fontSize: 40, fontWeight: 700, color: TEXT_DARK }}>
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 40,
                  fontWeight: 900,
                  color: PRIORITY_BAR_COLOR[item.priority],
                }}
              >
                {item.count}건
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 40,
                background: '#F0EDE8',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: PRIORITY_BAR_COLOR[item.priority],
                  borderRadius: 12,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ── 자막 바 ──────────────────────────────────────────────────────────────────
// 가장 긴 자막 "PMF Radar 가 카테고리별 cluster 자동 형성"
//   = 24자 × 44 × 0.55 ≈ 581 + padding 72 = 653 < 1920 ✓
const SUBTITLES: Array<{ startFrame: number; endFrame: number; text: string }> = [
  { startFrame: 0,   endFrame: 240, text: '다양한 채널에서 CS 문의 도착 (6건/8초)' },
  { startFrame: 240, endFrame: 480, text: 'PMF Radar 가 카테고리별 cluster 자동 형성' },
  { startFrame: 480, endFrame: 720, text: '가장 큰 cluster: 설치 실패 (2건, strong)' },
  { startFrame: 720, endFrame: 900, text: 'hplan 백로그에 개선 후보 자동 추가 + priority 분포' },
];

const SubtitleBar: React.FC<{ frame: number }> = ({ frame }) => {
  const current = SUBTITLES.find((s) => frame >= s.startFrame && frame < s.endFrame);
  if (!current) return null;

  const fadeIn = interpolate(frame, [current.startFrame, current.startFrame + 12], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const fadeOut = interpolate(frame, [current.endFrame - 12, current.endFrame], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 48,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: Math.min(fadeIn, fadeOut),
        background: 'rgba(26,26,26,0.78)',
        borderRadius: 12,
        padding: '12px 40px',
        fontFamily: '"Noto Sans KR", sans-serif',
        fontSize: 44,
        fontWeight: 700,
        color: '#FFFFFF',
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(6px)',
      }}
    >
      {current.text}
    </div>
  );
};

// ── 채널 태그 배지 ────────────────────────────────────────────────────────────

const ChannelTag: React.FC<{
  channel: string;
  count: number;
}> = ({ channel, count }) => (
  <div
    style={{
      background: channel === 'kakao' ? KAKAO_YELLOW : '#1A9AD5',
      borderRadius: 16,
      padding: '14px 28px',
      fontSize: 40,
      fontWeight: 800,
      color: channel === 'kakao' ? TEXT_DARK : '#FFFFFF',
      opacity: count > 0 ? 1 : 0.28,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      fontFamily: '"Noto Sans KR", sans-serif',
      whiteSpace: 'nowrap',
    }}
  >
    <span>{channel === 'kakao' ? '카카오톡' : 'Channel Talk'}</span>
    {count > 0 && (
      <span
        style={{
          background: 'rgba(0,0,0,0.18)',
          borderRadius: 10,
          padding: '3px 12px',
          fontSize: 36,
          fontWeight: 900,
        }}
      >
        {count}
      </span>
    )}
  </div>
);

// ─── 셀 3/4: Scene 컴포넌트 ─────────────────────────────────────────────────

// ── Scene 1: KakaoFrame burst (0~240) ────────────────────────────────────────
// KakaoFrame 960×780 — 말풍선 maxWidth=76%≈730px
// 메시지 카운터 카드 우상단 (숫자 76px, "건 문의" 38px)
// 채널 태그 좌상단 2개 (카카오톡/Channel Talk)
const Scene1: React.FC<{ frame: number }> = ({ frame }) => {
  const MSG_INTERVAL = 40;
  const revealUpTo = frame / MSG_INTERVAL;
  const visibleEndIdx = Math.min(5, Math.floor(frame / MSG_INTERVAL));

  const focusIsChannelTalk =
    visibleEndIdx >= 0 && BURST_MESSAGES[visibleEndIdx]?.channel === 'channel_talk';
  const channelLabel = focusIsChannelTalk ? 'Channel Talk' : '카카오톡 오픈채팅';
  const currentChannel = focusIsChannelTalk ? 'channel_talk' : 'kakao';
  const filteredMessages = BURST_MESSAGES.filter((m) => m.channel === currentChannel);
  const perChannelReveal = BURST_MESSAGES
    .slice(0, Math.max(0, revealUpTo))
    .filter((m) => m.channel === currentChannel).length;

  const switchFade = interpolate(frame % MSG_INTERVAL, [0, 8], [0.6, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const sceneOp = interpolate(frame, [220, 240], [1, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.in(Easing.cubic),
  });
  const totalVisible = Math.min(6, visibleEndIdx + 1);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: sceneOp,
        position: 'relative',
      }}
    >
      {/* KakaoFrame */}
      <div style={{ width: 960, height: 780, opacity: switchFade }}>
        <KakaoFrame
          channelLabel={channelLabel}
          messages={filteredMessages as KakaoMessage[]}
          revealUpTo={perChannelReveal}
        />
      </div>

      {/* 우상단 메시지 카운터 카드
          숫자 76px, "건 문의" 38px → 카드 최소 너비 = max(숫자 76×2ch=152, 텍스트 4자×38×0.55=84) + padding 36×2 = 224px */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          right: 96,
          background: TEXT_DARK,
          borderRadius: 20,
          padding: '22px 36px',
          fontFamily: '"Noto Sans KR", sans-serif',
          color: BG_PAGE,
          textAlign: 'center',
          minWidth: 160,
        }}
      >
        <div
          style={{
            fontSize: 76,
            fontWeight: 900,
            color: STOP_RED,
            lineHeight: 1,
            fontFamily: '"JetBrains Mono", "Courier New", monospace',
          }}
        >
          {totalVisible}
        </div>
        <div style={{ fontSize: 38, fontWeight: 600, marginTop: 8, opacity: 0.8 }}>
          건 문의
        </div>
      </div>

      {/* 좌상단 채널 태그 */}
      <div
        style={{
          position: 'absolute',
          top: 56,
          left: 96,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {['kakao', 'channel_talk'].map((ch) => {
          const cnt = BURST_MESSAGES.slice(0, visibleEndIdx + 1).filter(
            (m) => m.channel === ch,
          ).length;
          return <ChannelTag key={ch} channel={ch} count={cnt} />;
        })}
      </div>
    </div>
  );
};

// ── Scene 2: BubbleMap 형성 (240~480) ────────────────────────────────────────
// BubbleMap viewBox "0 0 1300 560"
// 상단 타이틀 72px, 범례 dot 22×22, fontSize 40
// 수학 검증: 위에서 CLUSTERS 정의 시 완료
const Scene2: React.FC<{ frame: number }> = ({ frame }) => {
  const localFrame = frame - 240;

  const animProgress = interpolate(localFrame, [0, 180], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const sceneOp = interpolate(
    localFrame,
    [0, 15, 220, 240],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const legendOp = interpolate(animProgress, [0.7, 1], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: sceneOp,
        position: 'relative',
      }}
    >
      {/* 상단 타이틀 */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: '"Noto Serif KR", "Noto Serif", Georgia, serif',
          fontSize: 72,
          fontWeight: 900,
          color: TEXT_DARK,
          letterSpacing: -0.5,
        }}
      >
        PMF Radar — Cluster 자동 형성
      </div>

      {/* BubbleMap: 타이틀 아래~범례 위 */}
      <div
        style={{
          position: 'absolute',
          top: 152,
          left: 40,
          right: 40,
          bottom: 120,
        }}
      >
        <BubbleMap
          clusters={CLUSTERS}
          animationProgress={animProgress}
          viewBox="0 0 1300 560"
        />
      </div>

      {/* 범례 — dot 22×22, label fontSize 40 */}
      <div
        style={{
          position: 'absolute',
          bottom: 124,
          right: 56,
          display: 'flex',
          gap: 32,
          fontFamily: '"Noto Sans KR", sans-serif',
          opacity: legendOp,
        }}
      >
        {[
          { color: STOP_RED,    label: '개선 필요 (Build)' },
          { color: '#2D7A57',   label: '가드레일 (Guardrail)' },
          { color: '#D6A238',   label: '인터뷰 대상 (Interview)' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 40, fontWeight: 600, color: TEXT_MUTED }}>
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Scene 3: Cluster drilldown (480~720) ─────────────────────────────────────
// 좌 BubbleMap 60% + 우 drilldown 카드 40%
// 수학 검증 (우 패널 ≈ 1920×0.40 - padding 80 = 688px):
//   cluster name "설치 실패" = 4자 × 88px × 0.55 ≈ 194 < 688 ✓
//   "2건 · strong signal" = 15자 × 44px × 0.55 ≈ 363 < 688 ✓
//   BacklogCard 내부 decision = 22자 × 44px × 0.55 ≈ 532 < 688 ✓
//   PUSH/ANXIETY 각 패널 = (688 - gap14) / 2 ≈ 337px
//     push text "첫 설치와 환경 차이..." = 16자 × 40px × 0.55 ≈ 352 ≈ 337 → word-break 처리 ✓
const Scene3: React.FC<{ frame: number }> = ({ frame }) => {
  const localFrame = frame - 480;

  const sceneOp = interpolate(
    localFrame,
    [0, 15, 220, 240],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const drilldownFade = interpolate(localFrame, [40, 90], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const drilldownY = interpolate(localFrame, [40, 90], [16, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        opacity: sceneOp,
        position: 'relative',
      }}
    >
      {/* 좌: BubbleMap (60%) */}
      <div
        style={{
          width: '60%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 40,
          paddingTop: 60,
          paddingBottom: 60,
          boxSizing: 'border-box',
        }}
      >
        <BubbleMap
          clusters={CLUSTERS}
          highlightIndex={0}
          animationProgress={1}
          viewBox="0 0 1300 560"
        />
      </div>

      {/* 우: drilldown 카드 (40%) */}
      <div
        style={{
          width: '40%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingRight: 48,
          paddingTop: 60,
          paddingBottom: 60,
          boxSizing: 'border-box',
          opacity: drilldownFade,
          transform: `translateY(${drilldownY}px)`,
        }}
      >
        <div style={{ width: '100%' }}>
          {/* Cluster 헤더 */}
          <div
            style={{
              marginBottom: 24,
              fontFamily: '"Noto Sans KR", sans-serif',
            }}
          >
            <div
              style={{
                fontSize: 34,
                fontWeight: 800,
                color: TEXT_MUTED,
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 8,
                fontFamily: '"JetBrains Mono", "Courier New", monospace',
              }}
            >
              가장 큰 cluster
            </div>
            <div
              style={{
                fontSize: 88,
                fontWeight: 900,
                color: FOCUS_CLUSTER.color,
                lineHeight: 1.1,
                fontFamily: '"Noto Serif KR", "Noto Serif", Georgia, serif',
                wordBreak: 'keep-all',
              }}
            >
              {FOCUS_CLUSTER.name}
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 600,
                color: TEXT_MUTED,
                marginTop: 8,
                fontFamily: '"Noto Sans KR", sans-serif',
              }}
            >
              2건 · strong signal
            </div>
          </div>

          <BacklogCard
            clusterName={FOCUS_CLUSTER.name}
            decision={FOCUS_CLUSTER.decision}
            push={FOCUS_CLUSTER.push}
            anxiety={FOCUS_CLUSTER.anxiety}
            priority={FOCUS_CLUSTER.priority}
            color={FOCUS_CLUSTER.color}
            fadeIn={1}
          />
        </div>
      </div>
    </div>
  );
};

// ── Scene 4: BacklogCard + PriorityChart (720~900) ───────────────────────────
// 좌: BacklogCard 50% / 우: PriorityChart 카드 40%
// 수학 검증 (우 패널 = 1920×0.40 - 60(padding) ≈ 708px, 패딩 48×2 제외 내부 612px):
//   label "Critical (5)" = 10자 × 40px × 0.55 ≈ 220 < 612 ✓
//   bar "count 2건" = 3자 × 40px × 0.55 ≈ 66 < 612 ✓
//   "총 문의" = 3자 × 40px × 0.55 ≈ 66, "6건" 2자 × 66 × 0.55 = 73 → 합 139 + gap < 612 ✓
const Scene4: React.FC<{ frame: number }> = ({ frame }) => {
  const localFrame = frame - 720;

  const sceneOp = interpolate(localFrame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const cardFade = interpolate(localFrame, [10, 50], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const chartRevealAt = interpolate(localFrame, [50, 150], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });
  const titleFade = interpolate(localFrame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const watermarkOp = interpolate(localFrame, [60, 90], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const totalCountOp = interpolate(chartRevealAt, [0.8, 1], [0, 1], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        opacity: sceneOp,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* 상단 타이틀 */}
      <div
        style={{
          position: 'absolute',
          top: 40,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: titleFade,
          fontFamily: '"JetBrains Mono", "Courier New", monospace',
        }}
      >
        <div
          style={{
            fontSize: 42,
            fontWeight: 800,
            color: TEXT_MUTED,
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          hplan backlog 자동 추가
        </div>
      </div>

      {/* 좌: BacklogCard (50%) */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          left: 60,
          width: '48%',
          bottom: 120,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <div style={{ width: '100%' }}>
          <BacklogCard
            clusterName={FOCUS_CLUSTER.name}
            decision={FOCUS_CLUSTER.decision}
            push={FOCUS_CLUSTER.push}
            anxiety={FOCUS_CLUSTER.anxiety}
            priority={FOCUS_CLUSTER.priority}
            color={FOCUS_CLUSTER.color}
            fadeIn={cardFade}
          />
        </div>
      </div>

      {/* 우: PriorityChart 카드 (40%) */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          right: 60,
          width: '40%',
          bottom: 120,
          display: 'flex',
          alignItems: 'center',
          opacity: chartRevealAt > 0 ? 1 : 0,
        }}
      >
        <div
          style={{
            width: '100%',
            background: '#FFFFFF',
            borderRadius: 22,
            padding: '44px 48px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.08)',
            borderLeft: `6px solid ${TEXT_DARK}`,
          }}
        >
          <PriorityChart data={PRIORITY_DISTRIBUTION} revealAt={chartRevealAt} />

          {/* 전체 건수 요약 */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 18,
              borderTop: '1px solid #F0EDE8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: '"Noto Sans KR", sans-serif',
              opacity: totalCountOp,
            }}
          >
            <span style={{ fontSize: 40, fontWeight: 600, color: TEXT_MUTED }}>
              총 문의
            </span>
            <span
              style={{
                fontSize: 66,
                fontWeight: 900,
                color: TEXT_DARK,
                fontFamily: '"JetBrains Mono", "Courier New", monospace',
              }}
            >
              6건
            </span>
          </div>
        </div>
      </div>

      {/* 워터마크 */}
      <div
        style={{
          position: 'absolute',
          bottom: 52,
          right: 72,
          fontFamily: '"JetBrains Mono", "Courier New", monospace',
          fontSize: 36,
          fontWeight: 700,
          color: '#CCCCCC',
          letterSpacing: 2,
          opacity: watermarkOp,
        }}
      >
        hplan · PMF Signal Radar
      </div>
    </div>
  );
};

// ─── 셀 4/4: 메인 컴포넌트 ──────────────────────────────────────────────────

export const DataToHplanDemo: React.FC = () => {
  const frame = useCurrentFrame();

  const inScene1 = frame < 240;
  const inScene2 = frame >= 240 && frame < 480;
  const inScene3 = frame >= 480 && frame < 720;
  const inScene4 = frame >= 720;

  return (
    <AbsoluteFill
      style={{
        background: BG_PAGE,
        fontFamily: '"Noto Sans KR", Apple SD Gothic Neo, sans-serif',
        color: TEXT_DARK,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Scene 1: KakaoFrame burst — 전환 오버랩 10f */}
      {(inScene1 || frame < 258) && <Scene1 frame={frame} />}

      {/* Scene 2: BubbleMap 형성 — 양 방향 오버랩 20f */}
      {(inScene2 || (frame >= 228 && frame < 498)) && <Scene2 frame={frame} />}

      {/* Scene 3: Cluster drilldown — 양 방향 오버랩 20f */}
      {(inScene3 || (frame >= 468 && frame < 738)) && <Scene3 frame={frame} />}

      {/* Scene 4: BacklogCard + PriorityChart */}
      {(inScene4 || frame >= 710) && <Scene4 frame={frame} />}

      {/* 자막 (전체 씬 위 고정 overlay) */}
      <SubtitleBar frame={frame} />
    </AbsoluteFill>
  );
};
