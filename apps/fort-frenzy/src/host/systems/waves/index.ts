// Generic wave generator: spends a threat budget on a pool and spreads the groups over lanes and time
// (SPEC §9.3, §9.4, §15.4). Extraction-ready (§15.1; Dungeon Crew reuses it for rooms): enemy ids are
// a generic and lanes are plain strings. Seeded: the same rng stream gives the same wave.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.
import { rngStream, type Rng } from '@pcg/game-kit';

/** One spawnable type. `cost` is per group; a group is `groupSize` units (default 1). */
export interface PoolEntry<E extends string> {
  id: E;
  cost: number;
  groupSize?: number;
}

/**
 * `count` groups that must spawn, paid from the budget. Cost and group size come from the pool entry
 * (or `cost`/`groupSize` here, e.g. a boss outside the pool; default cost 0, size 1). `lane` is used
 * when open.
 */
export interface GuaranteedSpawn<E extends string> {
  id: E;
  count: number;
  lane?: string;
  cost?: number;
  groupSize?: number;
}

export interface WaveInput<E extends string> {
  budget: number;
  pool: readonly PoolEntry<E>[];
  guaranteed: readonly GuaranteedSpawn<E>[];
  /** Open lanes. */
  lanes: readonly string[];
  durationMs: number;
  /** Types replaced and what replaces them (Flyers → ground units, §9); replacements cost as in the pool. */
  substitute?: Partial<Record<E, readonly E[]>>;
  rng: Rng;
}

/** One spawn: `count` units of `id` from `lane` at `atMs` into the wave. */
export interface WaveGroup<E extends string> {
  atMs: number;
  lane: string;
  id: E;
  count: number;
}

/** The seeded stream for wave `n`: `waves:<n>` (§15.3). */
export function waveRng(seed: number, wave: number): Rng {
  return rngStream(seed, `waves:${wave}`);
}

/** Player-count scaling (§9.4): `base + perPlayer × players`. */
export function playerScale(players: number, scaling: { base: number; perPlayer: number }): number {
  return scaling.base + scaling.perPlayer * players;
}

/** A wave's budget for `players`, with a difficulty multiplier on top (§2.2, §9.4). */
export function scaleBudget(
  budget: number,
  players: number,
  scaling: { base: number; perPlayer: number },
  difficulty = 1,
): number {
  return budget * playerScale(players, scaling) * difficulty;
}

/** Total pool cost of `groups` (ids outside the pool cost 0). */
export function groupsCost<E extends string>(
  groups: readonly { id: E }[],
  pool: readonly PoolEntry<E>[],
): number {
  let total = 0;
  for (const g of groups) total += pool.find((p) => p.id === g.id)?.cost ?? 0;
  return total;
}

interface Planned<E extends string> {
  id: E;
  count: number;
  lane: string | null;
}

/**
 * Pays the guaranteed spawns, then buys random affordable pool groups until nothing fits (so with a
 * cost-1 type the spend lands within 1 of the budget). Groups are shuffled, each placed in its own
 * equal slice of the duration, and the unpinned ones dealt round-robin over the open lanes.
 * Returned in time order.
 */
export function generateWave<E extends string>(input: WaveInput<E>): WaveGroup<E>[] {
  const { rng, lanes, substitute = {} } = input;
  if (lanes.length === 0) throw new Error('generateWave: no open lanes');
  const subs = substitute as Partial<Record<string, readonly E[]>>;
  const pool = input.pool.filter((p) => subs[p.id] === undefined);
  const entry = (id: E) => pool.find((p) => p.id === id);
  const planned: Planned<E>[] = [];
  let remaining = input.budget;

  for (const g of input.guaranteed) {
    const replacements = subs[g.id]?.filter((id) => entry(id) !== undefined);
    for (let k = 0; k < g.count; k++) {
      let id = g.id;
      if (replacements) {
        if (replacements.length === 0) break; // nothing to replace it with: dropped
        id = rng.pick(replacements);
      }
      const e = entry(id);
      const custom = id === g.id;
      remaining -= (custom ? g.cost : undefined) ?? e?.cost ?? 0;
      planned.push({
        id,
        count: (custom ? g.groupSize : undefined) ?? e?.groupSize ?? 1,
        lane: g.lane !== undefined && lanes.includes(g.lane) ? g.lane : null,
      });
    }
  }

  const buyable = pool.filter((p) => p.cost > 0);
  for (;;) {
    const fits = buyable.filter((p) => p.cost <= remaining + 1e-9);
    if (fits.length === 0) break;
    const p = rng.pick(fits);
    remaining -= p.cost;
    planned.push({ id: p.id, count: p.groupSize ?? 1, lane: null });
  }

  for (let i = planned.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [planned[i], planned[j]] = [planned[j]!, planned[i]!];
  }

  const n = planned.length;
  const slice = input.durationMs / Math.max(1, n);
  let lane = n > 0 ? rng.int(0, lanes.length - 1) : 0;
  return planned.map((g, i) => {
    const atMs = Math.floor(i * slice + rng.next() * slice);
    let at = g.lane;
    if (at === null) at = lanes[lane++ % lanes.length]!;
    return { atMs, lane: at, id: g.id, count: g.count };
  });
}
