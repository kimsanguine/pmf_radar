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

const CLUSTERS: BubbleCluster[] = [
  { x: 200, y: 220, r: 55, color: '#C8623A', name: '설치 실패', count: 2 },
  { x: 400, y: 160, r: 40, color: '#C8623A', name: 'PM 사고 연결', count: 1 },
  { x: 580, y: 250, r: 34, color: '#2D8A4F', name: '개인정보', count: 1 },
  { x: 700, y: 160, r: 34, color: '#D6A238', name: '재방문 의향', count: 1 },
  { x: 300, y: 330, r: 34, color: '#C8623A', name: '품질 판단', count: 1 },
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

const PRIORITY_BAR_COLOR: Record<number, string> = {
  5: '#C8623A',
  4: '#E0A445',
  3: '#2D8A4F',
};

const PriorityChart: React.FC<{
  data: Array<{ priority: number; count: number; label: string }>;
  revealAt: number; // 0~1, 각 bar 가 이 값 따라 오른쪽으로 확장
}> = ({ data, revealAt }) => {
  const maxCount = Math.max(...data.map((d) => d.count));

  return (
    <div
      style={{
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 800,
          color: '#888888',
          letterSpacing: 1,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        Priority 분포
      </div>
      {data.map((item, i) => {
        // stagger: 각 bar 가 revealAt 0→(i+1)/n 시점에 등장
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
                marginBottom: 5,
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1A1A1A' }}>
                {item.label}
              </span>
              <span
                style={{
                  fontSize: 13,
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
                height: 18,
                background: '#F0EDE8',
                borderRadius: 9,
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${barWidth}%`,
                  height: '100%',
                  background: PRIORITY_BAR_COLOR[item.priority],
                  borderRadius: 9,
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
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        opacity: Math.min(fadeIn, fadeOut),
        background: 'rgba(26, 26, 26, 0.82)',
        borderRadius: 10,
        padding: '10px 28px',
        fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
        fontSize: 22,
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
// 6 메시지, 각 ~40프레임 간격으로 등장
// 카카오 채널과 Channel Talk 를 교대로 전환
const Scene1: React.FC<{ frame: number }> = ({ frame }) => {
  const MSG_INTERVAL = 40; // 각 메시지 간격 (1.33s)

  // revealUpTo: 몇 번째 메시지까지 보일지 (0~6, float)
  const revealUpTo = frame / MSG_INTERVAL;

  // 현재 보여야 할 메시지 인덱스 (최대 2개씩 보여주되 마지막 보이는 것 기준)
  const visibleEndIdx = Math.min(5, Math.floor(frame / MSG_INTERVAL));

  // 채널별로 분리 — kakao 와 channel_talk 번갈아 포커싱
  // 짝수 번째(0,2,4) = kakao, 홀수(1,3,5) = 양쪽 중 현재 포커스
  const focusIsChannelTalk =
    visibleEndIdx >= 0 &&
    BURST_MESSAGES[visibleEndIdx]?.channel === 'channel_talk';

  const channelLabel = focusIsChannelTalk ? 'Channel Talk' : '카카오톡 오픈채팅';

  // 현재 채널에 맞는 메시지만 필터
  const currentChannel = focusIsChannelTalk ? 'channel_talk' : 'kakao';
  const filteredMessages = BURST_MESSAGES.filter((m) => m.channel === currentChannel);
  const filteredRevealUpTo =
    BURST_MESSAGES.slice(0, visibleEndIdx + 1).filter((m) => m.channel === currentChannel).length;

  // KakaoFrame 에 넘길 revealUpTo 는 해당 채널 내 몇 번째까지 (float)
  // 전체 revealUpTo 에서 해당 채널만 세기
  const perChannelReveal =
    BURST_MESSAGES.slice(0, Math.max(0, revealUpTo)).filter(
      (m) => m.channel === currentChannel,
    ).length;

  // 채널 전환 fade
  const switchFade = interpolate(
    frame % MSG_INTERVAL,
    [0, 8],
    [0.6, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // 전체 scene fade-out (마지막 20프레임)
  const sceneOpacity = interpolate(
    frame,
    [220, 240],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // 메시지 카운터 badge
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
          width: 560,
          height: 520,
          opacity: switchFade,
        }}
      >
        <KakaoFrame
          channelLabel={channelLabel}
          messages={filteredMessages as KakaoMessage[]}
          revealUpTo={perChannelReveal}
        />
      </div>

      {/* 우상단 메시지 카운터 */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          right: 160,
          background: '#1A1A1A',
          borderRadius: 12,
          padding: '12px 20px',
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
          color: '#FAF8F4',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 36, fontWeight: 900, color: '#C8623A' }}>
          {totalVisible}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, opacity: 0.8 }}>
          건 문의
        </div>
      </div>

      {/* 채널 태그 목록 */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: 160,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
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
                borderRadius: 8,
                padding: '6px 14px',
                fontSize: 13,
                fontWeight: 800,
                color: ch === 'kakao' ? '#1A1A1A' : '#FFFFFF',
                opacity: cnt > 0 ? 1 : 0.3,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{ch === 'kakao' ? '카카오톡' : 'Channel Talk'}</span>
              {cnt > 0 && (
                <span
                  style={{
                    background: 'rgba(0,0,0,0.18)',
                    borderRadius: 10,
                    padding: '1px 7px',
                    fontSize: 11,
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
          top: 60,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
          fontSize: 26,
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
          top: 120,
          left: 80,
          right: 80,
          bottom: 100,
        }}
      >
        <BubbleMap
          clusters={CLUSTERS}
          animationProgress={animationProgress}
          viewBox="0 0 900 430"
        />
      </div>

      {/* 범례 */}
      <div
        style={{
          position: 'absolute',
          bottom: 110,
          right: 100,
          display: 'flex',
          gap: 16,
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
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: item.color,
              }}
            />
            <span style={{ fontSize: 13, fontWeight: 600, color: '#555555' }}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Scene 3: Cluster drilldown (480~720)
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

  // BubbleMap 은 계속 표시 (progress=1 고정), highlightIndex=0
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
      {/* 좌측 BubbleMap (60%) */}
      <div
        style={{
          width: '60%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingLeft: 80,
          paddingTop: 80,
          paddingBottom: 80,
          boxSizing: 'border-box',
        }}
      >
        <BubbleMap
          clusters={CLUSTERS}
          highlightIndex={0}
          animationProgress={1}
          viewBox="0 0 760 430"
        />
      </div>

      {/* 우측 drilldown 카드 (40%) */}
      <div
        style={{
          width: '40%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          paddingRight: 80,
          paddingTop: 80,
          paddingBottom: 80,
          boxSizing: 'border-box',
          opacity: drilldownFade,
        }}
      >
        <div style={{ width: '100%' }}>
          {/* Cluster 헤더 */}
          <div
            style={{
              marginBottom: 16,
              fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: '#888888',
                letterSpacing: 1,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}
            >
              가장 큰 cluster
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 900,
                color: FOCUS_CLUSTER.color,
              }}
            >
              {FOCUS_CLUSTER.name}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: '#555555',
                marginTop: 2,
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

  // 상단 타이틀 fade
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
          top: 52,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: titleFade,
          fontFamily: '"Pretendard Variable", "Pretendard", "Noto Sans KR", sans-serif',
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: '#888888',
            letterSpacing: 1,
            textTransform: 'uppercase',
          }}
        >
          hplan backlog 자동 추가
        </div>
      </div>

      {/* 좌: BacklogCard (55%) */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 80,
          width: '50%',
          bottom: 100,
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

      {/* 우: PriorityChart (45%) */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          right: 80,
          width: '38%',
          bottom: 100,
          display: 'flex',
          alignItems: 'center',
          opacity: chartRevealAt > 0 ? 1 : 0,
        }}
      >
        <div
          style={{
            width: '100%',
            background: '#FFFFFF',
            borderRadius: 14,
            padding: '28px 28px',
            boxShadow: '0 6px 24px rgba(0,0,0,0.10)',
            borderLeft: '6px solid #1A1A1A',
          }}
        >
          <PriorityChart data={PRIORITY_DISTRIBUTION} revealAt={chartRevealAt} />

          {/* 전체 건수 요약 */}
          <div
            style={{
              marginTop: 24,
              paddingTop: 16,
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
            <span style={{ fontSize: 13, fontWeight: 600, color: '#888888' }}>
              총 문의
            </span>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#1A1A1A' }}>
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
          fontSize: 13,
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
