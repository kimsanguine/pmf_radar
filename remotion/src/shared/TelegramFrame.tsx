import React from 'react';
import { interpolate } from 'remotion';

// ─── 타입 ───────────────────────────────────────────────────────────────────

export type TelegramSignal = {
  category: string;       // "privacy"
  categoryLabel: string;  // "개인정보"
  strength: string;       // "strong"
  channel: string;        // "mock_channel_talk"
  timestamp: string;      // "2026-05-18 14:32"
};

export type TelegramFrameProps = {
  botName: string;        // "PMF Radar P2"
  chatLabel: string;      // "kimsanguine (운영자)"
  signal: TelegramSignal;
  revealAt: number;       // 0~1 — 0이면 숨김, 1이면 완전 노출 (애니메이션 제어)
};

// ─── 색상 상수 ─────────────────────────────────────────────────────────────

const TG_BG       = '#17212B';   // Telegram 다크 배경
const TG_HEADER   = '#232E3C';   // 헤더 영역
const TG_BUBBLE   = '#2B5278';   // 인바운드 버블 (봇 메시지)
const TG_ACCENT   = '#5288C1';   // Telegram 블루
const TG_TEXT     = '#FFFFFF';
const TG_MUTED    = '#A0ACBB';

const SOURCE_LABEL: Record<string, string> = {
  mock_kakao:         '카카오톡',
  mock_channel_talk:  'Channel Talk',
};

const STRENGTH_LABEL: Record<string, string> = {
  strong: '강한 신호',
  medium: '보통 신호',
  weak:   '약한 신호',
};

// ─── TelegramFrame ─────────────────────────────────────────────────────────

export const TelegramFrame: React.FC<TelegramFrameProps> = ({
  botName,
  chatLabel,
  signal,
  revealAt,
}) => {
  // revealAt 0→0.4: 창 전체 fade-in / 0.4→1: 메시지 카드 slide-in
  const windowOpacity = interpolate(revealAt, [0, 0.3], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardOpacity = interpolate(revealAt, [0.4, 0.8], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cardTranslateY = interpolate(revealAt, [0.4, 0.8], [20, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const sourceLabel = SOURCE_LABEL[signal.channel] ?? signal.channel;
  const strengthLabel = STRENGTH_LABEL[signal.strength] ?? signal.strength;

  return (
    <div
      style={{
        opacity: windowOpacity,
        width: '100%',
        height: '100%',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
        background: TG_BG,
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: TG_HEADER,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {/* 봇 아바타 */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: TG_ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            flexShrink: 0,
          }}
        >
          🤖
        </div>
        <div>
          <div style={{ color: TG_TEXT, fontWeight: 700, fontSize: 15 }}>
            {botName}
          </div>
          <div style={{ color: TG_MUTED, fontSize: 12, marginTop: 1 }}>
            봇 · {chatLabel}
          </div>
        </div>
        {/* 온라인 표시 */}
        <div
          style={{
            marginLeft: 'auto',
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#4CAF50',
          }}
        />
      </div>

      {/* 채팅 영역 */}
      <div
        style={{
          flex: 1,
          padding: '16px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          gap: 12,
        }}
      >
        {/* 봇 시스템 메시지 */}
        <div
          style={{
            opacity: cardOpacity,
            transform: `translateY(${cardTranslateY}px)`,
          }}
        >
          {/* 봇 라벨 */}
          <div style={{ color: TG_ACCENT, fontSize: 12, fontWeight: 700, marginBottom: 4, paddingLeft: 4 }}>
            {botName}
          </div>

          {/* 메시지 카드 */}
          <div
            style={{
              background: TG_BUBBLE,
              borderRadius: '4px 16px 16px 16px',
              padding: '14px 16px',
              maxWidth: '85%',
            }}
          >
            {/* 헤더 라인 */}
            <div
              style={{
                color: TG_ACCENT,
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1,
                marginBottom: 10,
                textTransform: 'uppercase',
              }}
            >
              HITL 검토 요청
            </div>

            {/* 신호 정보 그리드 */}
            <div style={{ display: 'grid', gap: 6 }}>
              {[
                ['카테고리', `${signal.categoryLabel} (${signal.category})`],
                ['신호 강도', strengthLabel],
                ['채널',     sourceLabel],
                ['수신 시각', signal.timestamp],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span
                    style={{
                      color: TG_MUTED,
                      fontSize: 12,
                      fontWeight: 600,
                      width: 70,
                      flexShrink: 0,
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ color: TG_TEXT, fontSize: 13, fontWeight: 700, lineHeight: 1.35 }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {/* 액션 버튼 (장식용) */}
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              {['직접 답변', '위임', '무시'].map((label) => (
                <div
                  key={label}
                  style={{
                    flex: 1,
                    padding: '6px 0',
                    background: 'rgba(255,255,255,0.10)',
                    borderRadius: 8,
                    color: TG_TEXT,
                    fontSize: 12,
                    fontWeight: 700,
                    textAlign: 'center',
                  }}
                >
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* 시간 */}
          <div
            style={{
              color: TG_MUTED,
              fontSize: 11,
              marginTop: 4,
              paddingLeft: 4,
            }}
          >
            {signal.timestamp}
          </div>
        </div>
      </div>

      {/* 입력창 (장식용) */}
      <div
        style={{
          background: TG_HEADER,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div
          style={{
            flex: 1,
            height: 36,
            borderRadius: 18,
            background: TG_BG,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: TG_ACCENT,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 16,
            color: '#FFFFFF',
          }}
        >
          ▶
        </div>
      </div>
    </div>
  );
};
