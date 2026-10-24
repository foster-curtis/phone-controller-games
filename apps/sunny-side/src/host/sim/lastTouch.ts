// Knockout credit (SPEC §6.1): fed only by egg–egg `collisionStart` pairs. Ghost pulses never
// call `touch`, so they neither set nor refresh anyone's last toucher. Pulses are tracked on their
// own (`pulsed`) only to label an uncredited knockout as a ghost knockout (`byGhost`).
import type { SimPlayerId } from './types';

export class LastTouch {
  private readonly last = new Map<SimPlayerId, { by: SimPlayerId; tick: number }>();
  /** Egg → tick of the last ghost pulse that pushed it. */
  private readonly pulses = new Map<SimPlayerId, number>();

  constructor(private readonly windowSteps: number) {}

  /** Egg–egg contact: each egg's last toucher becomes the other. */
  touch(a: SimPlayerId, b: SimPlayerId, tick: number): void {
    this.last.set(a, { by: b, tick });
    this.last.set(b, { by: a, tick });
  }

  /** A ghost pulse pushed this egg (leaves the last-touch record alone). */
  pulsed(id: SimPlayerId, tick: number): void {
    this.pulses.set(id, tick);
  }

  /** The credited player if the last touch is at most `windowSteps` old, else `null`. */
  creditFor(id: SimPlayerId, tick: number): SimPlayerId | null {
    const t = this.last.get(id);
    return t && tick - t.tick <= this.windowSteps ? t.by : null;
  }

  /** Ghost knockout: no egg credit, and a pulse pushed the egg within the same window. */
  byGhost(id: SimPlayerId, tick: number): boolean {
    if (this.creditFor(id, tick) !== null) return false;
    const p = this.pulses.get(id);
    return p !== undefined && tick - p <= this.windowSteps;
  }

  /** Drop everything recorded about this egg (removal). */
  forget(id: SimPlayerId): void {
    this.last.delete(id);
    this.pulses.delete(id);
  }

  clear(): void {
    this.last.clear();
    this.pulses.clear();
  }
}
