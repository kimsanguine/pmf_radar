import React from 'react';
import { interpolate } from 'remotion';

// ─── 타입 ───────────────────────────────────────────────────────────────────

export type BubbleCluster = {
  x: number;
  y: number;
  r: number;
  color: string;
  name: string;
  count: number;
};

export type BubbleMapProps = {
  clusters: BubbleCluster[];
  highlightIndex?: number;        // 강조할 cluster 인덱스 (없으면 undefined)
  animationProgress: number;      // 0~1, bubble 등장 진행도
  viewBox?: string;               // default "0 0 760 430"
};

// ─── BubbleMap ─────────────────────────────────────────────────────────────

export const BubbleMap: React.FC<BubbleMapProps> = ({
  clusters,
  highlightIndex,
  animationProgress,
  viewBox = '0 0 760 430',
}) => {
  // 각 bubble은 animationProgress 0→(i+1)/n 구간에서 등장
  const n = clusters.length;

  return (
    <svg
      viewBox={viewBox}
      style={{ width: '100%', height: '100%' }}
    >
      {/* 배경 격자 (옅은 선) */}
      <defs>
        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#grid)" />

      {clusters.map((cluster, i) => {
        // stagger 진입. 마지막 cluster 까지 fadeWidth 가 input range 안에 들도록 (1 - fadeWidth) 로 cap.
        // Remotion interpolate inputRange 가 monotonically strictly increasing 필수 — Math.min(1, ...) 이 동일값 만들면 throw.
        const fadeWidth = 0.15;
        const threshold = (i / Math.max(1, n)) * (1 - fadeWidth);
        const opacity = interpolate(
          animationProgress,
          [threshold, threshold + fadeWidth],
          [0, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );
        const scale = interpolate(
          animationProgress,
          [threshold, threshold + fadeWidth],
          [0.4, 1],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        );

        const isHighlighted = highlightIndex === i;
        const baseR = cluster.r;
        const displayR = isHighlighted ? baseR * 1.18 : baseR;

        return (
          <g
            key={i}
            opacity={opacity}
            transform={`translate(${cluster.x}, ${cluster.y}) scale(${scale})`}
            style={{ transformOrigin: `${cluster.x}px ${cluster.y}px` }}
          >
            {/* 강조 링 */}
            {isHighlighted && (
              <circle
                cx={0}
                cy={0}
                r={displayR + 10}
                fill="none"
                stroke={cluster.color}
                strokeWidth={2}
                strokeDasharray="6 4"
                opacity={0.6}
              />
            )}

            {/* 버블 */}
            <circle
              cx={0}
              cy={0}
              r={displayR}
              fill={cluster.color}
              fillOpacity={isHighlighted ? 0.92 : 0.75}
              stroke={cluster.color}
              strokeWidth={isHighlighted ? 2.5 : 1}
            />

            {/* cluster 이름 */}
            <text
              x={0}
              y={-8}
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize={Math.max(20, baseR * 0.52)}
              fontWeight="800"
              fontFamily="Apple SD Gothic Neo, Noto Sans KR, sans-serif"
            >
              {cluster.name}
            </text>

            {/* 건수 */}
            <text
              x={0}
              y={18}
              textAnchor="middle"
              fill="rgba(255,255,255,0.85)"
              fontSize={Math.max(16, baseR * 0.42)}
              fontWeight="700"
              fontFamily="monospace"
            >
              {cluster.count}건
            </text>
          </g>
        );
      })}
    </svg>
  );
};
