import {Composition} from 'remotion';
import {HplanPmfDemo} from './HplanPmfDemo';

export const RemotionRoot = () => {
  return (
    <Composition
      id="HplanPmfDemo"
      component={HplanPmfDemo}
      width={1280}
      height={720}
      fps={30}
      durationInFrames={390}
    />
  );
};
