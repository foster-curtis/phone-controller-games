// Per-kind object pools (SPEC §15.2 "Pooling"): render-side only. Projectiles, effects, damage
// numbers and Swarm units reuse Phaser objects; sim entities are plain objects.

export class Pool<T> {
  private free: T[] = [];
  /** Objects created so far (for the stress overlay). */
  created = 0;

  constructor(
    private readonly make: () => T,
    private readonly reset: (item: T, active: boolean) => void,
  ) {}

  get(): T {
    const item = this.free.pop() ?? (this.created++, this.make());
    this.reset(item, true);
    return item;
  }

  release(item: T) {
    this.reset(item, false);
    this.free.push(item);
  }

  get idle(): number {
    return this.free.length;
  }
}
