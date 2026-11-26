// Generic wave generator: spends a threat budget on a pool and spreads the groups over lanes and time
// (SPEC §9.3, §9.4, §15.4). Extraction-ready (§15.1; Dungeon Crew reuses it for rooms): enemy ids are
// a generic and lanes are plain strings. Seeded: the same rng stream gives the same wave.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only. RD2 added the v2 inputs (`sides`, `hot`,
// `hotShare`, `activeCap`) and `WaveGroup.hot`; without `hot` every lane is live and groups go
// round-robin over the lanes, one per slice of the duration. With `hot` and `sides` (RD3) groups
// spawn in pulses of up to `activeCap` groups, each with a hot side that gets the hot share
// (`hotPulses`).
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
  // ---- v2 (additive, RD3 implements the rules) ----
  /** Lane → side (Fort Frenzy: portal → `left` | `bottom` | `right`). */
  sides?: Readonly<Record<string, string>>;
  /** Hot-side schedule (§9.4). */
  hot?: { mode: 'wave'; shifts: 0 | 1 | 2 } | { mode: 'group' };
  /** Budget share to the hot side's lanes. */
  hotShare?: number;
  /** Lanes used per spawn pulse. */
  activeCap?: number;
}

/** One spawn: `count` units of `id` from `lane` at `atMs` into the wave. */
export interface WaveGroup<E extends string> {
  atMs: number;
  lane: string;
  id: E;
  count: number;
  /** The hot side at this group (v2, set when `hot` is). */
  hot?: string;
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
  /** What it cost from the budget (the hot share is a share of cost). */
  cost: number;
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
      const cost = (custom ? g.cost : undefined) ?? e?.cost ?? 0;
      remaining -= cost;
      planned.push({
        id,
        count: (custom ? g.groupSize : undefined) ?? e?.groupSize ?? 1,
        lane: g.lane !== undefined && lanes.includes(g.lane) ? g.lane : null,
        cost,
      });
    }
  }

  const buyable = pool.filter((p) => p.cost > 0);
  for (;;) {
    const fits = buyable.filter((p) => p.cost <= remaining + 1e-9);
    if (fits.length === 0) break;
    const p = rng.pick(fits);
    remaining -= p.cost;
    planned.push({ id: p.id, count: p.groupSize ?? 1, lane: null, cost: p.cost });
  }

  for (let i = planned.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [planned[i], planned[j]] = [planned[j]!, planned[i]!];
  }

  if (input.hot && input.sides) return hotPulses(input, planned, input.hot, input.sides);

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

/**
 * The hot-side rules (§9.3, §9.4; RD3). The shuffled groups are dealt into spawn pulses of up to
 * `activeCap` groups, each pulse at one time in its own equal slice of the duration, so a pulse never
 * uses more than `activeCap` lanes. Each pulse has a hot side: `wave` mode picks one for the wave and
 * shifts it at 1/2 (one shift) or 1/3 and 2/3 (two) of the duration to a different side; `group`
 * mode rolls one per pulse, never the same as the pulse before. Then the free groups of every pulse
 * are split between the hot side and the rest: at least one hot-side lane a pulse, the whole
 * wave's hot share of cost closest to `hotShare` and never under half, preferring one group
 * elsewhere in every pulse of two or more. Hot groups take the hot side's lanes in turn, the rest
 * the other sides' lanes in turn. A pinned guaranteed spawn keeps its lane and counts for its
 * lane's side.
 */
function hotPulses<E extends string>(
  input: WaveInput<E>,
  planned: Planned<E>[],
  hot: NonNullable<WaveInput<E>['hot']>,
  sides: Readonly<Record<string, string>>,
): WaveGroup<E>[] {
  const { rng, lanes, durationMs } = input;
  const share = input.hotShare ?? 0.5;
  const cap = Math.max(1, Math.min(lanes.length, Math.floor(input.activeCap ?? lanes.length)));
  const sideList: string[] = [];
  for (const l of lanes) {
    const sd = sides[l];
    if (sd !== undefined && !sideList.includes(sd)) sideList.push(sd);
  }
  const sideOf = (lane: string) => sides[lane] ?? '';
  /** A seeded side other than `prev` (`prev` itself when it is the only one). */
  const otherSide = (prev: string | null) => {
    const others = sideList.filter((x) => x !== prev);
    return others.length > 0 ? rng.pick(others) : (prev ?? '');
  };

  const n = planned.length;
  if (n === 0) return [];
  const count = Math.ceil(n / cap);
  const slice = durationMs / count;
  // `wave` mode: the hot side's timeline (from which ms each side is hot).
  const timeline: { at: number; side: string }[] = [];
  if (hot.mode === 'wave') {
    let side = otherSide(null);
    timeline.push({ at: 0, side });
    for (let k = 1; k <= hot.shifts; k++) {
      side = otherSide(side);
      timeline.push({ at: (durationMs * k) / (hot.shifts + 1), side });
    }
  }
  const turn = new Map<string, number>();
  const nextLane = (pool: readonly string[], key: string) => {
    const i = turn.get(key) ?? 0;
    turn.set(key, i + 1);
    return pool[i % pool.length]!;
  };

  // Each pulse: its time, hot side, groups, and which free groups may go where.
  interface Pulse {
    atMs: number;
    side: string;
    groups: Planned<E>[];
    free: number[];
    fixedHot: number;
    cost: number;
    pinnedHot: boolean;
    needOther: boolean;
    mask: number;
  }
  const ps: Pulse[] = [];
  let prevSide: string | null = null;
  for (let p = 0; p < count; p++) {
    const atMs = Math.floor(p * slice + rng.next() * slice);
    let side = timeline[0]?.side ?? '';
    if (hot.mode === 'group') side = otherSide(prevSide);
    else for (const x of timeline) if (x.at <= atMs) side = x.side;
    prevSide = side;
    const groups = planned.slice(p * cap, (p + 1) * cap);
    // Pinned groups count for their lane's side; the free ones are split hot / other.
    const pulse: Pulse = {
      atMs,
      side,
      groups,
      free: [],
      fixedHot: 0,
      cost: 0,
      pinnedHot: false,
      needOther: false,
      mask: 0,
    };
    let pinnedOther = false;
    groups.forEach((g, i) => {
      pulse.cost += g.cost;
      if (g.lane === null) pulse.free.push(i);
      else if (sideOf(g.lane) === side) {
        pulse.fixedHot += g.cost;
        pulse.pinnedHot = true;
      } else pinnedOther = true;
    });
    // With two or more groups, at least one goes elsewhere (solo: one hot-side portal and one other).
    const others = lanes.some((l) => sideOf(l) !== side);
    pulse.needOther = groups.length >= 2 && others && !pinnedOther;
    ps.push(pulse);
  }
  const hotOf = (p: Pulse, mask: number) => {
    let h = p.fixedHot;
    for (let b = 0; b < p.free.length; b++) if (mask & (1 << b)) h += p.groups[p.free[b]!]!.cost;
    return h;
  };
  // The split: over every pulse's allowed masks (at least one hot-side lane), the wave's hot cost
  // closest to `hotShare` of its cost and never under half, preferring one group elsewhere in every
  // pulse of two or more (solo: one hot-side portal and one other). Exact over the reachable hot
  // costs (a small knapsack), first mask wins ties, so it is deterministic.
  const ALL_HOT = 0.02;
  const key = (x: number) => Math.round(x * 1e6);
  type Step = { hot: number; penalty: number; mask: number; from: number };
  let layer = new Map<number, Step>([[0, { hot: 0, penalty: 0, mask: 0, from: 0 }]]);
  const trail: Map<number, Step>[] = [];
  let total = 0;
  for (const p of ps) {
    total += p.cost;
    const next = new Map<number, Step>();
    for (const [k, st] of layer) {
      for (let mask = 0; mask < 1 << p.free.length; mask++) {
        if (p.free.length === 0 && mask !== 0) break;
        if (p.free.length > 0 && mask === 0 && !p.pinnedHot) continue;
        const allHot = p.needOther && p.free.length > 0 && mask === (1 << p.free.length) - 1;
        const hot = st.hot + hotOf(p, mask);
        const penalty = st.penalty + (allHot ? 1 : 0);
        const nk = key(hot);
        const cur = next.get(nk);
        if (!cur || penalty < cur.penalty) next.set(nk, { hot, penalty, mask, from: k });
      }
    }
    trail.push(next);
    layer = next;
  }
  let bestKey = 0;
  let bestScore = Infinity;
  for (const [k, st] of layer) {
    const sh = total > 0 ? st.hot / total : share;
    const sc = Math.abs(sh - share) + (sh < 0.5 - 1e-9 ? 1 : 0) + st.penalty * ALL_HOT;
    if (sc < bestScore - 1e-12 || (Math.abs(sc - bestScore) <= 1e-12 && k < bestKey)) {
      bestScore = sc;
      bestKey = k;
    }
  }
  for (let i = ps.length - 1; i >= 0; i--) {
    const st = trail[i]!.get(bestKey)!;
    ps[i]!.mask = st.mask;
    bestKey = st.from;
  }

  const out: WaveGroup<E>[] = [];
  for (const p of ps) {
    const hotLanes = lanes.filter((l) => sideOf(l) === p.side);
    const coldLanes = lanes.filter((l) => sideOf(l) !== p.side);
    p.groups.forEach((g, i) => {
      let lane = g.lane;
      if (lane === null) {
        const toHot = (p.mask & (1 << p.free.indexOf(i))) !== 0 || coldLanes.length === 0;
        lane = toHot ? nextLane(hotLanes, `hot:${p.side}`) : nextLane(coldLanes, 'cold');
      }
      out.push({ atMs: p.atMs, lane, id: g.id, count: g.count, hot: p.side });
    });
  }
  return out;
}
