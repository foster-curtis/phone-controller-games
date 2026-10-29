// TV sound effects player (SPEC §15.10). FF1 stub: a no-op player; FF13 preloads the theme's files,
// unlocks on the first keypress and rate-limits cues.
import type { SfxId } from '../../shared/ids';

export interface Sfx {
  play(id: SfxId): void;
  /** Called on the first user gesture (browser autoplay rules). */
  unlock(): void;
  readonly unlocked: boolean;
}

export function createSfx(): Sfx {
  return {
    play() {},
    unlock() {},
    unlocked: false,
  };
}
