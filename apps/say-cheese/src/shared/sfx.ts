// Sound effects (SPEC §3, §6.8): synthesized with Web Audio on the TV and the phone (BUILD_PLAN §8).
// SC8 implements the synth; until then everything plays `noopSfx`.
// Frozen at SC0 (BUILD_PLAN §3): additive changes only.

export const SFX_NAMES = [
  'beep',
  'beepFinal',
  'startBuzz',
  'endBuzz',
  'shutter',
  'develop',
  'sting',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export interface Sfx {
  /** Resumes the AudioContext; call from a user gesture (Ready / I'm ready / a host key). */
  unlock(): Promise<void>;
  /** Fire and forget; silent while locked. */
  play(name: SfxName): void;
  readonly unlocked: boolean;
}

/** Silent `Sfx`: tests, and every build before SC8. */
export const noopSfx: Sfx = {
  unlock: () => Promise.resolve(),
  play: () => {},
  unlocked: false,
};
