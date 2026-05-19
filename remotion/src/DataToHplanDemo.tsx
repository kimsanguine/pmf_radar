import React from 'react';
import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
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
    text: 'AGENTS.md 왜 중요한지 감은 오는데 막막해요',
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
    text: '업무별 starter kit 가 있으면 재수강할 듯해요',
    time: '오후 2:24',
    type: 'inbound',
    channel: 'kakao',
    category: 'retention',
  },
  {
    author: '수강생 — npm 에러',
    text: 'npm install 에러가 났는데 제 문제인지 강의 문제인지...',
    time: '오후 2:28',
    type: 'inbound',
    channel: 'kakao',
    category: 'setup',
  },
  {
    author: '팀 리드',
    text: '팀원 5명에게 들려주고 싶은데 결과물 템플릿이 있나요?',
    time: '오후 2:31',
    type: 'inbound',
    channel: 'channel_talk',
    category: 'output_quality',
  },
];

const CATEGORY_COLOR: Record<string, string> = {
  setup: '#C8623A',
  concept_confusion: '#C8623A',
  privacy: '#2D8A4F',
  retention: '#D6A238',
  output_quality: '#C8623A',
};

// Fix 3: BubbleMap 글자 overlap 해소
// r 확대 + x/y 좌표 spread + viewBox "0 0 1300 580" 으로 확장
// BubbleMap 내부 fontSize = max(40, r×1.04)
//   r=100 → fontSize=104 (설치 실패 2글자, d=200, 내부 여유 충분)
//   r=72  → fontSize≈75  (PM 사고 연결 5글자, d=144)
//   r=60  → fontSize≈62  (3~4글자, d=120)
// 클러스터 간 최소 거리 > r1+r2 검증:
//   설치실패↔PM사고연결: dist≈301 > 172 ✓
//   설치실패↔품질판단:   dist≈219 > 160 ✓
//   기타 모두 여유 확보 ✓
// R15: cluster radius 키움 + fontSize 20% 안 (r×0.85) + viewBox 1900×900 확대
// 수학: r=160 fontSize=136 → '설치' width 150 < diameter 320 ✓
const _r15CacheBust = 'r15-v3-bubble-big';
// R17: viewBox 2400×1100 + cluster x spread (간격 > 라벨 width 646)
// y stagger (위/아래 교차) 로 라벨 영역 분리. cluster 간 거리 > r1+r2+label width 보장.
// R18: BacklogCard 헤더 column stack (shared/BacklogCard.tsx) + Scene 3 카드 영역 자막 overlap 해소.
const _r18CacheBust = 'r18-v3-backlog-stack-2026-05-19';
const CLUSTERS: BubbleCluster[] = [
  { x: 380,  y: 350, r: 160, color: '#C8623A', name: '설치 실패',   count: 2 },
  { x: 1100, y: 350, r: 120, color: '#C8623A', name: 'PM 사고 연결', count: 1 },
  { x: 1800, y: 350, r: 105, color: '#2D8A4F', name: '개인정보',     count: 1 },
  { x: 720,  y: 850, r: 105, color: '#D6A238', name: '재방문 의향',  count: 1 },
  { x: 1500, y: 850, r: 105, color: '#C8623A', name: '품질 판단',   count: 1 },
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

// ─── 셀 2/4: PriorityChart (Scene 4 전용 inline 컴포넌트) ───────────────────
// Round 9: bar height 24→44 (fontSize 42 × 1.05), gap 14→22

const PRIORITY_BAR_COLOR: Record<number, string> = {
  5: '#C8623A',
  4: '#E0A445',
  3: '#2D8A4F',
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
        // gap: fontSize 42 × 0.52 = 22
        gap: 22,
        fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 42,
          fontWeight: 800,
          color: '#888888',
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 12,
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
        const rowOpacity = interpolate(barProgress, [0, 0.3], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <div key={item.priority} style={{ opacity: rowOpacity }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 12,
              }}
            >
              <span style={{ fontSize: 42, fontWeight: 700, color: '#1A1A1A' }}>
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 800,
                  color: PRIORITY_BAR_COLOR[item.priority],
                }}
              >
                {item.count}건
              </span>
            </div>
            <div
              style={{
                width: '100%',
                // height: fontSize 42 × 1.05 = 44
                height: 44,
                background: '#F0EDE8',
                borderRadius: 14,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: PRIORITY_BAR_COLOR[item.priority],
                  borderRadius: 14,
                  transition: 'width 0.05s linear',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── 셀 3/4: 자막 컴포넌트 ──────────────────────────────────────────────────

const SUBTITLES: Array<{ startFrame: number; endFrame: number; text: string }> = [
  { startFrame: 0, endFrame: 240, text: '다양한 채널에서 CS 문의 도착 (6건/8초)' },
  { startFrame: 240, endFrame: 480, text: 'PMF Radar 가 카테고리별 cluster 자동 형성' },
  { startFrame: 480, endFrame: 720, text: '가장 큰 cluster: 설치 실패 (2건, strong)' },
  { startFrame: 720, endFrame: 900, text: 'hplan 백로그에 개선 후보 자동 추가 + priority 분포' },
];

const SubtitleBar: React.FC<{ frame: number }> = ({ frame }) => {
  const current = SUBTITLES.find((s) => frame >= s.startFrame && frame < s.endFrame);
  if (!current) return null;

  const fadeIn = interpolate(
    frame,
    [current.startFrame, current.startFrame + 12],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const fadeOut = interpolate(
    frame,
    [current.endFrame - 12, current.endFrame],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 56,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: Math.min(fadeIn, fadeOut),
        background: 'rgba(26, 26, 26, 0.82)',
        borderRadius: 14,
        padding: '20px 48px',
        fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
        fontSize: 60,
        fontWeight: 700,
        color: '#FFFFFF',
        letterSpacing: 0.3,
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(4px)',
      }}
    >
      {current.text}
    </div>
  );
};

// ─── 셀 4/4: Scene 구현 + 메인 컴포넌트 ─────────────────────────────────────

// Scene 1: KakaoFrame burst (0~240)
// Round 9:
//   - KakaoFrame wrapper: 960×780 유지 (버블 maxWidth=76% → 실 너비≈730px, 텍스트 수용 충분)
//   - 카운터 카드: padding 24×40 → 36×56 (숫자 112 × 0.32~0.5)
//   - 채널 태그: padding 16×32 유지 (fontSize 44 × 0.36~0.73, 적정)
const Scene1: React.FC<{ frame: number }> = ({ frame }) => {
  const MSG_INTERVAL = 40;

  const revealUpTo = frame / MSG_INTERVAL;
  const visibleEndIdx = Math.min(5, Math.floor(frame / MSG_INTERVAL));

  const focusIsChannelTalk =
    visibleEndIdx >= 0 &&
    BURST_MESSAGES[visibleEndIdx]?.channel === 'channel_talk';

  const channelLabel = focusIsChannelTalk ? 'Channel Talk' : '카카오톡 오픈채팅';

  const currentChannel = focusIsChannelTalk ? 'channel_talk' : 'kakao';
  const filteredMessages = BURST_MESSAGES.filter((m) => m.channel === currentChannel);

  const perChannelReveal =
    BURST_MESSAGES.slice(0, Math.max(0, revealUpTo)).filter(
      (m) => m.channel === currentChannel,
    ).length;

  const switchFade = interpolate(
    frame % MSG_INTERVAL,
    [0, 8],
    [0.6, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const sceneOpacity = interpolate(
    frame,
    [220, 240],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const totalVisible = Math.min(6, visibleEndIdx + 1);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: sceneOpacity,
        position: 'relative',
      }}
    >
      {/* 중앙 KakaoFrame */}
      <div
        style={{
          width: 960,
          height: 780,
          opacity: switchFade,
        }}
      >
        <KakaoFrame
          channelLabel={channelLabel}
          messages={filteredMessages as KakaoMessage[]}
          revealUpTo={perChannelReveal}
        />
      </div>

      {/* 우상단 메시지 카운터 카드
          Fix 2: 채널 태그(fontSize 44)와 비례 맞춤 — 숫자 80, padding 24×40 */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          right: 100,
          background: '#1A1A1A',
          borderRadius: 20,
          padding: '24px 40px',
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
          color: '#FAF8F4',
          textAlign: 'center',
          minWidth: 160,
        }}
      >
        <div style={{ fontSize: 80, fontWeight: 900, color: '#C8623A', lineHeight: 1 }}>
          {totalVisible}
        </div>
        <div style={{ fontSize: 40, fontWeight: 600, marginTop: 8, opacity: 0.8 }}>
          건 문의
        </div>
      </div>

      {/* 채널 태그 목록 */}
      <div
        style={{
          position: 'absolute',
          top: 60,
          left: 100,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
        }}
      >
        {['kakao', 'channel_talk'].map((ch) => {
          const cnt = BURST_MESSAGES.slice(0, visibleEndIdx + 1).filter(
            (m) => m.channel === ch,
          ).length;
          return (
            <div
              key={ch}
              style={{
                background: ch === 'kakao' ? '#FEE500' : '#1A9AD5',
                borderRadius: 16,
                padding: '16px 32px',
                fontSize: 44,
                fontWeight: 800,
                color: ch === 'kakao' ? '#1A1A1A' : '#FFFFFF',
                opacity: cnt > 0 ? 1 : 0.3,
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <span>{ch === 'kakao' ? '카카오톡' : 'Channel Talk'}</span>
              {cnt > 0 && (
                <span
                  style={{
                    background: 'rgba(0,0,0,0.18)',
                    borderRadius: 12,
                    padding: '4px 14px',
                    fontSize: 40,
                    fontWeight: 900,
                  }}
                >
                  {cnt}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Scene 2: BubbleMap 형성 (240~480)
// Round 9:
//   - CLUSTERS r 확대로 cluster name 텍스트 클리핑 해소 (BubbleMap shared 내부 변경 없음)
//   - 범례 dot: 18×18 → 24×24 (fontSize 44 × 0.55)
//   - 범례 gap: 24→32, item gap: 10→14
const Scene2: React.FC<{ frame: number }> = ({ frame }) => {
  const localFrame = frame - 240;

  const animationProgress = interpolate(localFrame, [0, 180], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sceneOpacity = interpolate(
    localFrame,
    [0, 15, 220, 240],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        opacity: sceneOpacity,
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
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
          fontSize: 80,
          fontWeight: 900,
          color: '#1A1A1A',
          letterSpacing: 0.3,
        }}
      >
        PMF Radar — Cluster 자동 형성
      </div>

      {/* BubbleMap 전체 영역 */}
      <div
        style={{
          position: 'absolute',
          top: 160,
          left: 40,
          right: 40,
          bottom: 120,
        }}
      >
        <BubbleMap
          clusters={CLUSTERS}
          animationProgress={animationProgress}
          viewBox="0 0 2400 1100"
        />
      </div>

      {/* 범례 — dot 크기·gap 비례 재구성 */}
      <div
        style={{
          position: 'absolute',
          bottom: 130,
          right: 60,
          display: 'flex',
          gap: 32,
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
          opacity: interpolate(animationProgress, [0.6, 1], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        {[
          { color: '#C8623A', label: '개선 필요 (Build)' },
          { color: '#2D8A4F', label: '가드레일 (Guardrail)' },
          { color: '#D6A238', label: '인터뷰 대상 (Interview)' },
        ].map((item) => (
          <div
            key={item.label}
            style={{ display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 44, fontWeight: 600, color: '#555555' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Scene 3: Cluster drilldown (480~720)
// Round 9:
//   - "가장 큰 cluster" 라벨: 40→38 (cluster name 88 × 0.43)
//   - "2건 · strong signal" 부제: 48→44 (cluster name 88 × 0.50)
//   - marginBottom 헤더→카드: 24→28 (cluster name × 0.32)
const Scene3: React.FC<{ frame: number }> = ({ frame }) => {
  const localFrame = frame - 480;

  const sceneOpacity = interpolate(
    localFrame,
    [0, 15, 220, 240],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const drilldownFade = interpolate(localFrame, [40, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        opacity: sceneOpacity,
        position: 'relative',
      }}
    >
      {/* 좌측 BubbleMap (56%) — R18: 우측 카드폭 확장(44%)에 맞춤 */}
      <div
        style={{
          width: '56%',
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
          viewBox="0 0 2400 1100"
        />
      </div>

      {/* 우측 drilldown 카드 (40%)
          R18: paddingBottom 60→160 (자막 SubtitleBar bottom 56 영역 회피)
          R18: width 40%→44% (BacklogCard 헤더 새 column 헤더에 폭 여유) */}
      <div
        style={{
          width: '44%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingRight: 40,
          paddingTop: 60,
          paddingBottom: 160,
          boxSizing: 'border-box',
          opacity: drilldownFade,
        }}
      >
        <div style={{ width: '100%' }}>
          {/* Cluster 헤더 */}
          <div
            style={{
              marginBottom: 28,
              fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
            }}
          >
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: '#888888',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 8,
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
              }}
            >
              {FOCUS_CLUSTER.name}
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 600,
                color: '#555555',
                marginTop: 8,
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

// Scene 4: BacklogCard + PriorityChart (720~900)
// Round 9:
//   - 상단 타이틀 fontSize 48→46
//   - PriorityChart 카드 padding 40→48 (PriorityChart 내부 fontSize 42 기준 × 1.14)
//   - "총 문의" label fontSize 44→42
const Scene4: React.FC<{ frame: number }> = ({ frame }) => {
  const localFrame = frame - 720;

  const sceneOpacity = interpolate(localFrame, [0, 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardFade = interpolate(localFrame, [10, 50], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const chartRevealAt = interpolate(localFrame, [50, 150], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const titleFade = interpolate(localFrame, [0, 25], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        opacity: sceneOpacity,
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
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 46,
            fontWeight: 800,
            color: '#888888',
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
          width: '50%',
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

      {/* 우: PriorityChart (40%) */}
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
            borderRadius: 20,
            // padding: PriorityChart 내부 fontSize 42 기준 × 1.14 = 48
            padding: '48px 48px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.10)',
            borderLeft: '6px solid #1A1A1A',
          }}
        >
          <PriorityChart data={PRIORITY_DISTRIBUTION} revealAt={chartRevealAt} />

          {/* 전체 건수 요약 */}
          <div
            style={{
              marginTop: 28,
              paddingTop: 20,
              borderTop: '1px solid #F0EDE8',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
              opacity: interpolate(chartRevealAt, [0.8, 1], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            <span style={{ fontSize: 42, fontWeight: 600, color: '#888888' }}>
              총 문의
            </span>
            <span style={{ fontSize: 72, fontWeight: 900, color: '#1A1A1A' }}>
              6건
            </span>
          </div>
        </div>
      </div>

      {/* 우하단 hplan 로고 워터마크 */}
      <div
        style={{
          position: 'absolute',
          bottom: 52,
          right: 80,
          fontFamily: 'monospace',
          fontSize: 40,
          fontWeight: 700,
          color: '#CCCCCC',
          letterSpacing: 2,
          opacity: interpolate(localFrame, [60, 90], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        hplan · PMF Signal Radar
      </div>
    </div>
  );
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export const DataToHplanDemo: React.FC = () => {
  const frame = useCurrentFrame();

  const inScene1 = frame < 240;
  const inScene2 = frame >= 240 && frame < 480;
  const inScene3 = frame >= 480 && frame < 720;
  const inScene4 = frame >= 720;

  return (
    <AbsoluteFill
      style={{
        background: '#FAF8F4',
        fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
        color: '#1A1A1A',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Scene 1: KakaoFrame burst */}
      {(inScene1 || frame < 260) && <Scene1 frame={frame} />}

      {/* Scene 2: BubbleMap 형성 */}
      {(inScene2 || (frame >= 230 && frame < 500)) && <Scene2 frame={frame} />}

      {/* Scene 3: Cluster drilldown */}
      {(inScene3 || (frame >= 470 && frame < 740)) && <Scene3 frame={frame} />}

      {/* Scene 4: BacklogCard + PriorityChart */}
      {(inScene4 || frame >= 710) && <Scene4 frame={frame} />}

      {/* 자막 (전체 씬 위에 고정 overlay) */}
      <SubtitleBar frame={frame} />
    </AbsoluteFill>
  );
};
