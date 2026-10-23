// Spectator emoji (SPEC §6.6): per-phone cooldown, on the match clock (no Date.now()).
import { EMOJI, type EmojiIndex } from '../../shared/messages';
import { TIME_EPSILON_MS } from './config';

export function isEmojiIndex(v: unknown): v is EmojiIndex {
  return Number.isInteger(v) && (v as number) >= 0 && (v as number) < EMOJI.length;
}

export class EmojiLimiter {
  private readonly last = new Map<string, number>();

  constructor(private readonly cooldownMs: number) {}

  /** True (and records the send) if `key` is off cooldown at `nowMs`. */
  allow(key: string, nowMs: number): boolean {
    const prev = this.last.get(key);
    if (prev !== undefined && nowMs - prev < this.cooldownMs - TIME_EPSILON_MS) return false;
    this.last.set(key, nowMs);
    return true;
  }

  clear(): void {
    this.last.clear();
  }
}
