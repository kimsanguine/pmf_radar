import { Composition } from 'remotion';
import { HplanPmfDemo } from './HplanPmfDemo';
import { AutoReplyDemo } from './AutoReplyDemo';
import { HitlDemo } from './HitlDemo';
import { DataToHplanDemo } from './DataToHplanDemo';

export const RemotionRoot = () => {
  return (
    <>
      {/* 기존 hero 영상 — 변경 금지 */}
      <Composition
        id="HplanPmfDemo"
        component={HplanPmfDemo}
        width={1280}
        height={720}
        fps={30}
        durationInFrames={390}
      />

      {/* V1: 자동 응답 데모 */}
      <Composition
        id="auto-reply-demo"
        component={AutoReplyDemo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={900}
      />

      {/* V2: HITL 검토 데모 */}
      <Composition
        id="hitl-demo"
        component={HitlDemo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={900}
      />

      {/* V3: 데이터 → hplan 데모 */}
      <Composition
        id="data-to-hplan-demo"
        component={DataToHplanDemo}
        width={1920}
        height={1080}
        fps={30}
        durationInFrames={900}
      />
    </>
  );
};
