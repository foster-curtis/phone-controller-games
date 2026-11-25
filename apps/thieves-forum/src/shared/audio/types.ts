// Audio map (SPEC §6.20, §12.8; §9 "audio map in config"): which files the Web Audio module plays for
// the bed, the one-shots and each cue, and the duck rules. No game imports: the cue names are a type
// parameter, so this folder can move into `@pcg/game-kit` (extraction candidate, BUILD_PLAN §8).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only.

/** A file as a Vite asset URL (or null: synthesize a placeholder, TF11). */
export type AudioSrc = string | null;

export interface AudioBed {
  src: AudioSrc;
  /** Fixed gain (§6.20: does not follow the NPC count), dB. */
  gainDb: number;
  /** Crossfade at the loop point, ms. */
  loopCrossfadeMs: number;
}

export interface AudioOneShots {
  srcs: readonly AudioSrc[];
  /** Random gap between one-shots, ms. */
  intervalMs: readonly [number, number];
  gainDb: number;
  /** ± random variation. */
  gainJitterDb: number;
  /** ± playback-rate variation (0.05 = ±5%). */
  pitchJitter: number;
  /** Max |pan| for the random stereo position (0..1). */
  panRange: number;
  /** Never play the same one-shot twice in a row. */
  noRepeat: boolean;
}

export interface AudioCue {
  src: AudioSrc;
  gainDb: number;
  /** Duck the ambience under this cue (§6.20). */
  ducks: boolean;
}

export interface AudioDuck {
  /** Ambience change while ducked, dB (negative). */
  db: number;
  /** Duck hold, ms. */
  ms: number;
  attackMs: number;
  releaseMs: number;
}

export interface AudioMap<Cue extends string = string> {
  bed: AudioBed;
  oneShots: AudioOneShots;
  cues: Record<Cue, AudioCue>;
  duck: AudioDuck;
  /** Scenes whose ambience (bed + one-shots) is silent. */
  silentAmbienceIn: readonly string[];
}
