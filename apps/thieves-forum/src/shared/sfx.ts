// Sound-effect cues (SPEC §6.20, §12.8): the TV's small SFX set, played only from `tv` sim events.
// There is deliberately no grab or pickpocket cue: a sound for a successful steal would reveal the thief
// (§6.11, §6.20). Phones stay silent and use `noopSfx`.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only. Append-only registry (BUILD_PLAN §2).

export const SFX_CUES = [
  'coinClink', // coin toss, catch payout
  'glanceSwoosh', // merchant glance wind-up
  'thiefShout', // "THIEF!"
  'guardWhistle', // guard spot or alert
  'gateCreak', // reinforcement through the gate
  'stocksClank', // thief locked in the stocks
  'roundBell', // round start and "Hands up!"
  'revealPop', // each reveal card
  'fanfare', // podium winner
  'firework', // podium fireworks
] as const;
export type SfxCue = (typeof SFX_CUES)[number];

/** Audio scenes (§6.20 ducking): the ambience drops out under the reveal and podium. */
export type SfxScene = 'silent' | 'play' | 'reveal' | 'podium';

export interface SfxOptions {
  /** Stereo pan −1..1 (e.g. from the event's screen x). */
  pan?: number;
}

export interface Sfx {
  play(cue: SfxCue, opts?: SfxOptions): void;
  scene(name: SfxScene): void;
}

export const noopSfx: Sfx = {
  play() {},
  scene() {},
};
