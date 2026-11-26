// Public API of the shared Web Audio module (SPEC §12.8). No game imports.
export { createAudioEngine, dbToGain, decodeFromUrl } from './engine';
export type {
  AudioCtxLike,
  AudioEngine,
  AudioEngineOptions,
  AudioScene,
  PlayOptions,
  SynthFn,
  SynthSet,
} from './engine';
export type { AudioBed, AudioCue, AudioDuck, AudioMap, AudioOneShots, AudioSrc } from './types';
