// The run simulation's entry point (SPEC §15.3, §15.9): create a sim from `RunStart`, step it, feed it
// input sources and commands; record and replay runs; hash its state.
export { createSim, type Sim, type SimOptions, type StepObserver } from './sim';
export { stateHash } from './hash';
export { inSector, type Sector } from './classes/sector';
export { hitShape, type HitShape } from './classes/hitShape';
export { groundBody, type GroundBody } from './body';
export {
  aimPreview,
  buildEffectRadius,
  buildPreview,
  fieldMedicRadius,
  type BuildPreview,
} from './preview';
export { canPlace } from './builds';
export { squadSize } from './squad';
export { steadyOn } from './modules/steadyAim';
export {
  AutopilotInputSource,
  FreshInputSource,
  neutralInput,
  ReplayInputSource,
  ScriptedInputSource,
} from './sources';
export {
  hashEvery,
  recordAutopilotRun,
  replayRun,
  RunRecorder,
  type ReplayResult,
  type RunRecording,
} from './recorder';
export { itemState, type ShopItemState } from './shop';
export { canSpawnFor, guaranteedRare, offerFor } from './cards';
export { shieldOf } from './cards/effects';
export {
  parseSnapshot,
  resumeStart,
  takeSnapshot,
  SNAPSHOT_KEY,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_VERSION,
  type RunSnapshot,
  type SnapshotMeta,
} from './snapshot';
