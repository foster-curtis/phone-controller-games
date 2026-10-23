// Knockout credit (SPEC §6.1): fed only by egg–egg `collisionStart` pairs. Ghost pulses never
// call `touch`, so they neither set nor refresh anyone's last toucher.
import type { SimPlayerId } from './types';

export class LastTouch {
  private readonly last = new Map<SimPlayerId, { by: SimPlayerId; tick: number }>();

  constructor(private readonly windowSteps: number) {}

  /** Egg–egg contact: each egg's last toucher becomes the other. */
  touch(a: SimPlayerId, b: SimPlayerId, tick: number): void {
    this.last.set(a, { by: b, tick });
    this.last.set(b, { by: a, tick });
  }

  /** The credited player if the last touch is at most `windowSteps` old, else `null`. */
  creditFor(id: SimPlayerId, tick: number): SimPlayerId | null {
    const t = this.last.get(id);
    return t && tick - t.tick <= this.windowSteps ? t.by : null;
  }

  clear(): void {
    this.last.clear();
  }
}
