// @pcg/game-kit public API: host-side helpers every game shares (Fort Frenzy SPEC §15.1).
// Frozen at FF0 (Fort Frenzy BUILD_PLAN §3): additive changes only.
// No Phaser, and nothing here touches the DOM on import: DOM-facing helpers read `document`,
// `navigator` and `location` lazily (or take them as parameters), so sims can import the RNG and
// loop in Node. Dev-server plugins live in `@pcg/game-kit/vite`.

export {
  catchUpSteps,
  createFixedStep,
  type FixedStep,
  type FixedStepOptions,
  type FrameResult,
} from './loop';
export { lerp, lerpAngle } from './interpolate';
export { fnv1a, rngStream, type Rng } from './rng';

export { watchVisibility, type VisibilityDoc } from './visibility';
export { createHostWakeLock, type HostWakeLock, type WakeLockEnv } from './wakeLock';
export { DEV_RELAY_PORT, relayUrl } from './relayUrl';
export {
  hostUrl,
  isLoopbackHost,
  joinUrl,
  lanBanner,
  pickLanAddress,
  type NetInterfaceInfo,
  type NetInterfaces,
} from './lan';
export { qrMatrix, type QrMatrix } from './qr';
export { debugEnabled, installDebug } from './debug';
