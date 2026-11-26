// Forum `Sfx` over the shared audio engine (SPEC §6.20, §12.8; BUILD_PLAN TF11). TV only; phones use
// `noopSfx`. `installUnlock` is the click/keydown hook for the host and the lobby "Sound on" control
// (wired in TF7/TF12). There is no grab or pickpocket cue to play (§6.11).
import { createAudioEngine, type AudioCtxLike, type AudioEngine } from '../../shared/audio';
import type { Sfx, SfxCue } from '../../shared/sfx';
import { FORUM_AUDIO_MAP } from './map';
import { FORUM_SYNTH } from './synth';

export interface ForumSfx extends Sfx {
  /** Create/resume the context from a user gesture, then start the bed and one-shots. */
  unlock(): Promise<void>;
  readonly unlocked: boolean;
  readonly engine: AudioEngine<SfxCue>;
}

export interface CreateSfxOptions {
  createContext?: () => AudioCtxLike | null;
  rng?: () => number;
}

function defaultContext(): AudioCtxLike | null {
  const w = globalThis as unknown as {
    AudioContext?: new () => AudioCtxLike;
    webkitAudioContext?: new () => AudioCtxLike;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function createSfx(opts: CreateSfxOptions = {}): ForumSfx {
  const engine = createAudioEngine<SfxCue>({
    createContext: opts.createContext ?? defaultContext,
    map: FORUM_AUDIO_MAP,
    rng: opts.rng ?? Math.random, // sound variation only: never sim state, so not seeded
    synth: FORUM_SYNTH,
  });
  engine.startBed();
  engine.startOneShots();
  return {
    engine,
    get unlocked() {
      return engine.unlocked;
    },
    unlock: () => engine.unlock(),
    play: (cue, o) => engine.play(cue, o),
    scene: (name) => engine.setScene(name),
  };
}

interface GestureTarget {
  addEventListener(type: string, fn: () => void, opts?: { capture?: boolean }): void;
  removeEventListener(type: string, fn: () => void, opts?: { capture?: boolean }): void;
}

/** Unlock on the first click, key press or touch on `target` (browsers need a gesture). Returns a remover. */
export function installUnlock(
  target: GestureTarget,
  sfx: Pick<ForumSfx, 'unlock' | 'unlocked'>,
  events: readonly string[] = ['pointerdown', 'click', 'keydown'],
): () => void {
  const off = () =>
    events.forEach((e) => target.removeEventListener(e, onGesture, { capture: true }));
  function onGesture(): void {
    // Keep listening if the context refused (e.g. blocked by autoplay policy) so a later gesture retries.
    void sfx.unlock().then(() => {
      if (sfx.unlocked) off();
    });
  }
  events.forEach((e) => target.addEventListener(e, onGesture, { capture: true }));
  return off;
}
