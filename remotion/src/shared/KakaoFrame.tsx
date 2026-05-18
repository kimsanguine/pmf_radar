import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';

// ─── 타입 ───────────────────────────────────────────────────────────────────

export type KakaoMessage = {
  author: string;       // 예: "수강생 — 비개발 PM"
  text: string;
  time: string;         // 예: "오후 2:14"
  type: 'inbound' | 'outbound';
};

export type KakaoFrameProps = {
  channelLabel: string;  // "카카오톡 오픈채팅" | "Channel Talk"
  messages: KakaoMessage[];
  revealUpTo: number;    // 0 ~ messages.length, 애니메이션 제어용
};

// ─── 색상 상수 ─────────────────────────────────────────────────────────────

const KAKAO_YELLOW = '#FEE500';
const INBOUND_BG   = '#F5F5F5';
const OUTBOUND_BG  = '#FEE500';
const HEADER_BG    = '#3E2723';   // 카카오 헤더 다크 브라운
const WINDOW_BG    = '#B2C7D9';   // 카카오 채팅창 배경 (파스텔 블루-그레이)
const TEXT_DARK    = '#1A1A1A';
const TEXT_MUTED   = '#555555';
const TIME_COLOR   = '#888888';

// ─── 말풍선 ────────────────────────────────────────────────────────────────

const Bubble: React.FC<{
  msg: KakaoMessage;
  opacity: number;
}> = ({ msg, opacity }) => {
  const isOut = msg.type === 'outbound';

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: isOut ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: 12,
        opacity,
        marginBottom: 18,
      }}
    >
      {/* 인바운드 프로필 영역 */}
      {!isOut && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: '#CFD8DC',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              color: TEXT_MUTED,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {msg.author.charAt(0)}
          </div>
          <span style={{ fontSize: 16, color: TEXT_MUTED, whiteSpace: 'nowrap' }}>
            {msg.author.split('—')[0].trim()}
          </span>
        </div>
      )}

      {/* 말풍선 + 시간 */}
      <div
        style={{
          display: 'flex',
          flexDirection: isOut ? 'row-reverse' : 'row',
          alignItems: 'flex-end',
          gap: 8,
          maxWidth: '76%',
        }}
      >
        <div
          style={{
            padding: '16px 22px',
            borderRadius: isOut
              ? '22px 22px 4px 22px'
              : '22px 22px 22px 4px',
            background: isOut ? OUTBOUND_BG : INBOUND_BG,
            color: TEXT_DARK,
            fontSize: 24,
            fontWeight: 600,
            lineHeight: 1.5,
            boxShadow: '0 1px 3px rgba(0,0,0,0.10)',
          }}
        >
          {msg.text}
        </div>
        <span style={{ fontSize: 16, color: TIME_COLOR, flexShrink: 0 }}>
          {msg.time}
        </span>
      </div>
    </div>
  );
};

// ─── KakaoFrame ────────────────────────────────────────────────────────────

export const KakaoFrame: React.FC<KakaoFrameProps> = ({
  channelLabel,
  messages,
  revealUpTo,
}) => {
  const frame = useCurrentFrame();

  // revealUpTo 기준으로 각 메시지 opacity 계산 (fade-in 18프레임)
  const opacities = messages.map((_, i) => {
    // 메시지 i는 revealUpTo > i 가 되는 순간부터 등장
    // revealUpTo를 프레임 기반으로 쓸 경우를 대비해 float도 허용
    const start = i;
    const raw = revealUpTo - start;
    return Math.min(1, Math.max(0, raw));
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 16,
        overflow: 'hidden',
        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
        fontFamily: 'Apple SD Gothic Neo, Noto Sans KR, sans-serif',
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          background: HEADER_BG,
          padding: '18px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: 10,
            background: KAKAO_YELLOW,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 24,
          }}
        >
          💬
        </div>
        <span
          style={{
            color: '#FFFFFF',
            fontWeight: 700,
            fontSize: 22,
            letterSpacing: 0.3,
          }}
        >
          {channelLabel}
        </span>
      </div>

      {/* 채팅창 */}
      <div
        style={{
          flex: 1,
          background: WINDOW_BG,
          padding: '24px 20px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
        }}
      >
        {messages.map((msg, i) => (
          <Bubble key={i} msg={msg} opacity={opacities[i]} />
        ))}
      </div>

      {/* 입력창 (장식용) */}
      <div
        style={{
          background: '#FFFFFF',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          borderTop: '1px solid #E0E0E0',
        }}
      >
        <div
          style={{
            flex: 1,
            height: 44,
            borderRadius: 22,
            background: '#F5F5F5',
            border: '1px solid #E0E0E0',
          }}
        />
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: KAKAO_YELLOW,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
          }}
        >
          ▶
        </div>
      </div>
    </div>
  );
};
