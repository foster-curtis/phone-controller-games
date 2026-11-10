// TV sound effects player (SPEC §12, §15.10): preloads the theme's files behind the home loading bar,
// unlocks on the first keypress (browser autoplay rules), and gives each cue a volume and a rate
// limit so a 20-hit volley is one thud, not a wall of noise.
import { SFX_IDS, type SfxId } from '../../shared/ids';

export interface Sfx {
  play(id: SfxId): void;
  /** Called on the first user gesture (browser autoplay rules). */
  unlock(): void;
  readonly unlocked: boolean;
  /** Fetches and decodes every mapped file; `onProgress` gets 0..1. Never rejects. */
  preload(onProgress?: (p: number) => void): Promise<void>;
}

export interface CueTuning {
  /** 0..1 gain. */
  volume: number;
  /** At most `max` plays per `windowMs`. */
  max: number;
  windowMs: number;
}

const D = (volume: number, max: number, windowMs: number): CueTuning => ({ volume, max, windowMs });

/** Tuning constants (not frozen): hot cues (hits, deaths) get tight caps, rare ones play always. */
export const TUNING: Record<SfxId, CueTuning> = {
  base_alarm: D(0.6, 1, 2000),
  base_hit: D(0.8, 2, 250),
  player_hit: D(0.7, 2, 200),
  enemy_hit: D(0.35, 3, 120),
  enemy_death: D(0.5, 3, 150),
  structure_placed: D(0.7, 2, 200),
  structure_destroyed: D(0.8, 2, 250),
  boss_windup: D(0.9, 1, 1000),
  purchase: D(0.6, 2, 200),
  card_pick: D(0.6, 2, 200),
  wave_start: D(0.8, 1, 2000),
  victory: D(0.9, 1, 5000),
  defeat: D(0.9, 1, 5000),
};

/** The slice of the Web Audio API the player uses (a fake stands in under test). */
export interface AudioLike {
  state: string;
  resume(): Promise<void>;
  decode(data: ArrayBuffer): Promise<unknown>;
  start(buffer: unknown, volume: number): void;
}

export interface SfxDeps {
  audio?: AudioLike;
  fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  now?: () => number;
  tuning?: Record<SfxId, CueTuning>;
}

function browserAudio(): AudioLike | undefined {
  if (typeof AudioContext === 'undefined') return undefined;
  const ctx = new AudioContext();
  return {
    get state() {
      return ctx.state;
    },
    resume: () => ctx.resume(),
    decode: (d) => ctx.decodeAudioData(d),
    start(buffer, volume) {
      const src = ctx.createBufferSource();
      src.buffer = buffer as AudioBuffer;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain).connect(ctx.destination);
      src.start();
    },
  };
}

/** `files` is `ThemeHost.sfx`: cue id to file URL. */
export function createSfx(files: Partial<Record<SfxId, string>> = {}, deps: SfxDeps = {}): Sfx {
  const audio = deps.audio ?? browserAudio();
  const now = deps.now ?? (() => performance.now());
  const fetchBytes = deps.fetchBytes ?? (async (u: string) => (await fetch(u)).arrayBuffer());
  const tuning = deps.tuning ?? TUNING;
  const buffers = new Map<SfxId, unknown>();
  const recent = new Map<SfxId, number[]>();
  let unlocked = false;

  const sfx: Sfx = {
    get unlocked() {
      return unlocked;
    },
    unlock() {
      if (unlocked || !audio) return;
      unlocked = true;
      void audio.resume().catch(() => {});
    },
    async preload(onProgress) {
      const ids = SFX_IDS.filter((id) => files[id]);
      let done = 0;
      onProgress?.(ids.length === 0 ? 1 : 0);
      await Promise.all(
        ids.map(async (id) => {
          try {
            if (audio) buffers.set(id, await audio.decode(await fetchBytes(files[id]!)));
          } catch {
            // A missing file is a silent cue, never a broken run.
          }
          done++;
          onProgress?.(done / ids.length);
        }),
      );
    },
    play(id) {
      const buffer = buffers.get(id);
      if (!audio || !unlocked || buffer === undefined) return;
      const t = tuning[id];
      const t0 = now();
      const times = (recent.get(id) ?? []).filter((x) => t0 - x < t.windowMs);
      if (times.length >= t.max) {
        recent.set(id, times);
        return;
      }
      times.push(t0);
      recent.set(id, times);
      audio.start(buffer, t.volume);
    },
  };
  return sfx;
}

/** Unlocks on the first key (or tap) on the page, once. */
export function unlockOnFirstKey(sfx: Sfx, target: Window = window): void {
  const go = () => {
    sfx.unlock();
    target.removeEventListener('keydown', go);
    target.removeEventListener('pointerdown', go);
  };
  target.addEventListener('keydown', go);
  target.addEventListener('pointerdown', go);
}
