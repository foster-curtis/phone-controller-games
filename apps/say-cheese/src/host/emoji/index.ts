// Emoji reactions, host side (SPEC §6.6 emoji bullet, §7.3 `emoji`): a per-phone cooldown and an
// on-screen cap. Plain TS: no DOM, no Phaser, no net-client. The TV layer (view/emoji.ts) paints it.
import { EMOJI } from '../../shared/messages';

/** One phone may react this often (SPEC §6.6). */
export const EMOJI_COOLDOWN_MS = 500;
/** Emoji on the TV at once; the oldest is dropped past this (SPEC §6.6 "~12"). */
export const EMOJI_MAX_ON_SCREEN = 12;

export interface EmojiItem {
  id: number;
  /** Index into `EMOJI`. */
  i: number;
  glyph: string;
}

export interface EmojiResult {
  /** The accepted emoji, or null when it was ignored. */
  added: EmojiItem | null;
  /** The oldest one dropped to stay under the cap. */
  evicted: EmojiItem | null;
}

export interface EmojiFeed {
  /** `allowed` is false for the photographer's phone and outside review / results. */
  accept(phoneId: string, i: number, allowed: boolean): EmojiResult;
  /** An emoji's float finished (or the layer cleared it). */
  remove(id: number): void;
  clear(): void;
  items(): readonly EmojiItem[];
}

export function createEmojiFeed(opts: {
  now: () => number;
  cooldownMs?: number;
  max?: number;
}): EmojiFeed {
  const cooldown = opts.cooldownMs ?? EMOJI_COOLDOWN_MS;
  const max = opts.max ?? EMOJI_MAX_ON_SCREEN;
  const last = new Map<string, number>();
  let list: EmojiItem[] = [];
  let nextId = 1;
  const none: EmojiResult = { added: null, evicted: null };

  return {
    accept(phoneId, i, allowed) {
      if (!allowed || !Number.isInteger(i) || i < 0 || i >= EMOJI.length) return none;
      const t = opts.now();
      const prev = last.get(phoneId);
      if (prev !== undefined && t - prev < cooldown) return none;
      last.set(phoneId, t);
      const added: EmojiItem = { id: nextId++, i, glyph: EMOJI[i]! };
      list.push(added);
      const evicted = list.length > max ? list.shift()! : null;
      return { added, evicted };
    },
    remove(id) {
      list = list.filter((e) => e.id !== id);
    },
    clear() {
      list = [];
    },
    items: () => list,
  };
}
