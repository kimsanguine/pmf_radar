# Remotion 운영 가이드 (PMF Radar)

> 2026-05-19 R18 사이클 (V2/V3 합쳐 18 라운드 누적) 학습을 표준화한 운영 노하우. 새 영상 사이클 시작 전 이 문서를 먼저 읽으면 1~2 라운드 안에 PASS 가능.

## 영상 컴포지션

| ID | Composition | shared 의존 | 보호 정책 |
|---|---|---|---|
| V1 | `auto-reply-demo` (AutoReplyDemo.tsx) | KakaoFrame | **절대 수정 금지** (사용자 명시 제약) |
| V2 | `hitl-demo` (HitlDemo.tsx) | KakaoFrame, RadarBadge, TelegramFrame | 자유 |
| V3 | `data-to-hplan-demo` (DataToHplanDemo.tsx) | KakaoFrame, BubbleMap, BacklogCard | 자유 |

> `Root.tsx` 의 `<Composition id="..."/>` 는 **kebab-case**. `npx remotion render src/index.ts HitlDemo` 는 실패 — `hitl-demo` 사용.

## shared 컴포넌트 수정 영향

```bash
# 수정 전 반드시 import 그래프 확인
grep -l "BacklogCard" remotion/src/*.tsx
# → DataToHplanDemo.tsx 만 → V1/V2 영향 없음, 수정 가능

grep -l "KakaoFrame" remotion/src/*.tsx
# → AutoReplyDemo, HitlDemo, DataToHplanDemo 모두 사용 → V1 영향, 수정 금지
```

| Shared | V1 | V2 | V3 | 수정 가능? |
|---|---|---|---|---|
| KakaoFrame | ✓ | ✓ | ✓ | ✗ (V1 보호) |
| RadarBadge | — | ✓ | — | ✓ |
| TelegramFrame | — | ✓ | — | ✓ |
| BubbleMap | — | — | ✓ | ✓ |
| BacklogCard | — | — | ✓ | ✓ |

> V1 이 사용하는 컴포넌트를 수정해야 하는 경우 → **wrapper 에 inline style cascade** 로 우회. 예: `wordBreak: 'keep-all'` 을 wrapper div 에 적용하면 KakaoFrame 내부 텍스트까지 영향.

## 표준 deploy 시퀀스

```bash
cd /Users/sanguinekim/Documents/3_Code/pmf_radar

# 1) Remotion render
cd remotion
npx remotion render src/index.ts hitl-demo out/hitl-demo.mp4 --overwrite
npx remotion render src/index.ts data-to-hplan-demo out/data-to-hplan-demo.mp4 --overwrite

# 2) MD5 + ffmpeg 시각 검증 (생략 금지)
md5 out/*.mp4   # 이전 라운드와 다른지 확인
ffmpeg -ss 14 -i out/hitl-demo.mp4 -frames:v 1 -update 1 -y /tmp/check_v2_14s.png
ffmpeg -ss 18 -i out/data-to-hplan-demo.mp4 -frames:v 1 -update 1 -y /tmp/check_v3_18s.png

# 3) demo/assets/ 로 cache buster 파일명 복사
cp out/hitl-demo.mp4 ../demo/assets/hitl-demo.v17.mp4
cp out/data-to-hplan-demo.mp4 ../demo/assets/data-to-hplan-demo.v17.mp4

# 4) demo/cases.html src 갱신 (v16 → v17)

# 5) wrangler pages deploy (git push 만으론 자동 배포 X)
cd ..
npx wrangler pages deploy demo --project-name=pmf-radar --branch=main --commit-message="..."

# 6) commit + push
git add -A && git commit -m "fix(remotion): R19 ..." && git push
```

## 7 표준 함정

### 1. Composition ID 는 kebab-case

```bash
# ✗ Could not find composition with ID HitlDemo
npx remotion render src/index.ts HitlDemo out/hitl-demo.mp4

# ✓
npx remotion render src/index.ts hitl-demo out/hitl-demo.mp4
```

### 2. mp4 cache buster = 파일명 변경

```html
<!-- ✗ inplace 변경 → 브라우저 disk cache + Cloudflare stale-while-revalidate 함정 -->
<video src="assets/hitl-demo.mp4">

<!-- ✓ URL key 갱신 -->
<video src="assets/hitl-demo.v16.mp4">
```

### 3. shared 컴포넌트 V1 보호

수정 전 위 "shared 컴포넌트 수정 영향" 표 확인. V1 의존 컴포넌트는 wrapper 에서만 조정.

### 4. 한국어 word-break: keep-all cascade

```tsx
// ✗ 기본: "검토" 가 "검 / 토" 음절 분리
<div style={{ width: 700 }}>
  <KakaoFrame ... />
</div>

// ✓ wrapper inline keep-all → CSS cascade 로 내부 bubble 까지
<div style={{ width: 700, wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
  <KakaoFrame ... />
</div>
```

한국어 텍스트가 들어가는 모든 Remotion wrapper 에 사실상 default.

### 5. Zero-sum 좌우 폭 균형

Scene 의 horizontal space 가 고정 (1808px, 1920 - padding 56×2) 인데 좌측 KakaoFrame + gap + 화살표 + gap + 우측 GateBlock(flex:1) 이 그 안에서 zero-sum.

```
좌측 500 → 우측 1164 (영문 한 줄 OK)
좌측 900 → 우측 764 (영문 라벨 두 줄 깨짐)
좌측 700 → 우측 964 (균형 PASS)
```

**한쪽 조정 시 반드시 다른쪽 frame 도 캡처해서 동시 검증**. 한쪽만 PASS 선언하면 다음 라운드에서 다른쪽 깨짐 발견.

### 6. Layout overflow 해결 = axis transform > fontSize 축소

```tsx
// ✗ fontSize 축소 (사용자 한도 ±20%) + row 유지
<div style={{ display: 'flex', justifyContent: 'space-between' }}>
  <Badge /> <Title /> <span>hplan backlog</span>  // 여전히 overflow
</div>

// ✓ row → column axis transform
<div style={{ display: 'flex', flexDirection: 'column' }}>
  <span>hplan backlog</span>          // 상단 단독
  <div><Badge /> <Title /></div>      // 한 줄
</div>
```

fontSize 한도 (±20%) 가 강한 제약일 때 column stack 이 first option.

### 7. ffmpeg frame 시각 검증 표준

```bash
# 안정 구간 timestamp 선택 (fade transition 시점 피하기)
# Scene 3 fade [40, 90] → frame 540+ 부터 안정 → 18s 캡처

ffmpeg -ss 18 -i out/data-to-hplan-demo.mp4 -frames:v 1 -update 1 -y /tmp/v3_18s.png
```

> `-update 1` 안 적으면 sequence pattern 경고. fade 구간 캡처 시 9KB 빈 frame 나옴 — Scene 내부 안정 timestamp 선택.

## Round 이력

| Round | V1 | V2 | V3 | 비고 |
|---|---|---|---|---|
| R10~R13 | freeze v12 | dense layout | dense layout | shared 컴포넌트 일관성 |
| R14 | freeze v12 | tgRevealAt [400,480] + dummy const | CLUSTERS r 120/88/80 | webpack stale render 해소 |
| R15~R17 | freeze v12 | (없음) | viewBox 2400×1100 + 2-row stagger | BubbleMap 라벨 overlap 해소 |
| **R18** | **freeze v12** | **KakaoFrame keep-all + wrapper 700** | **BacklogCard column stack + 폭 44%** | **사용자 최종 PASS** |

## 관련 문서

- [README.md](../README.md) — 프로젝트 overview
- [P2_DESIGN.md](./P2_DESIGN.md) — Workers + Supabase backend 설계
- [PROGRESS.md](./PROGRESS.md) — 작업 진행 상황
