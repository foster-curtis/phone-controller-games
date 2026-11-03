// The run simulation's entry point (SPEC §15.3, §15.9): create a sim from `RunStart`, step it, feed it
// input sources and commands; record and replay runs; hash its state.
export { createSim, type Sim, type SimOptions, type StepObserver } from './sim';
export { stateHash } from './hash';
export { placementValid, tileAt } from './building';
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
