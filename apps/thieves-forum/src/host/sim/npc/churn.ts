// Crowd churn (SPEC §6.10, §6.2): the planned count is `round(32/3 + 8/3 × players)`; after the players-only
// opening the planned NPCs stream in over `balance.npcs.streamInMs`, then NPCs keep walking on and off
// through the four lane entries (never the gate) for the whole round, keeping the live count within
// ±8% of the plan (rounded, at least ±1). Departures are natural (a finished wish list); arrivals refill
// the crowd after a short random delay, at once if the count would leave the band.
import type { Balance, EntryId } from '../../../content/types';
import { assignOutfit, OUTFIT_STREAM } from '../outfits';
import { makeCitizen } from '../citizen';
import type { StepContext } from '../systems';
import { TUNING } from '../tuning';
import type { Character, World } from '../types';
import type { CrowdBand } from '../lifecycle/types';
import { createMind } from './mind';
import type { CrowdState } from './types';

/** The planned NPC count for `players`: round(base + perPlayer × players) (SPEC §6.10, §7). */
export function plannedNpcs(players: number, b: Balance): number {
  return Math.round(b.npcs.base + b.npcs.perPlayer * players);
}

/** The planned NPC count and its tolerance band for `players` (SPEC §6.10, §7). */
export function crowdBand(players: number, b: Balance): CrowdBand {
  return bandFor(plannedNpcs(players, b), b);
}

/** The tolerance band around a planned count. */
export function bandFor(planned: number, b: Balance): CrowdBand {
  const tol = Math.max(b.npcs.toleranceMin, Math.round(planned * b.npcs.tolerance));
  return { planned, min: planned - tol, max: planned + tol };
}

export const newCrowd = (): CrowdState => ({
  playStart: -1,
  spawned: 0,
  exited: 0,
  nextArrivalAt: 0,
});

/** Live NPCs: characters an NPC mind owns outright (walking on and off included). */
export const liveNpcs = (world: World): number =>
  world.characters.reduce((n, c) => n + (c.control.k === 'npc' ? 1 : 0), 0);

/** The shops of the round's open stalls. */
export const openShops = (world: World) => world.stalls.filter((s) => s.open).map((s) => s.shop);

/** Spawns one NPC just off screen at `entry`, walking in (SPEC §6.10). */
export function spawnNpc(ctx: StepContext, entry: EntryId): Character {
  const { world, content } = ctx;
  const e = content.layout.entries.find((x) => x.id === entry)!;
  const id = world.nextId;
  const rng = ctx.rng(`npc:${id}`);
  const mind = createMind(rng, content, openShops(world));
  const r = content.balance.movement.bodyRadius;
  const out = Math.sign(e.spawn.x - e.at.x) || 1;
  const at = { x: e.spawn.x, y: e.spawn.y + (rng.next() * 2 - 1) * TUNING.churn.spawnSpreadY };
  // Never spawn on top of someone still walking in: step further out.
  for (let tries = 0; tries < 20; tries++) {
    const hit = world.characters.some(
      (c) => (c.x - at.x) ** 2 + (c.y - at.y) ** 2 < (2 * r + 0.1) ** 2,
    );
    if (!hit) break;
    at.x += out * (2 * r + 0.1);
  }
  const outfit = assignOutfit(ctx.rng(OUTFIT_STREAM), content.balance.outfit);
  const c = makeCitizen(
    world,
    at,
    r,
    outfit,
    mind,
    { k: 'npc' },
    null,
    { k: 'entering', entry },
    Math.atan2(e.at.y - at.y, e.at.x - at.x),
  );
  mind.nav!.leg = 'entry';
  mind.nav!.path = [{ x: e.at.x, y: at.y }];
  mind.goal = { x: e.at.x, y: at.y };
  world.characters.push(c);
  if (world.crowd) world.crowd.spawned++;
  ctx.emit({ ch: 'tv', e: 'enter', character: c.id });
  return c;
}

/** Keeps the crowd streaming in and churning (runs after the minds, so exits are counted). */
export function stepChurn(ctx: StepContext): void {
  const { world, content } = ctx;
  if (world.phase !== 'play') return;
  const crowd = (world.crowd ??= newCrowd());
  const t = world.tick;
  if (crowd.playStart < 0) crowd.playStart = t;
  const rng = ctx.rng('churn');
  const entries = content.layout.entries;
  const planned = world.plannedNpcs;
  const band = bandFor(planned, content.balance);
  // Stream-in after the opening: evenly over streamInMs, round-robin over the entries.
  const stream = ctx.ticks(content.balance.npcs.streamInMs);
  if (crowd.spawned < planned) {
    while (
      crowd.spawned < planned &&
      t >= crowd.playStart + Math.floor((crowd.spawned * stream) / planned)
    )
      spawnNpc(ctx, entries[(crowd.spawned + (world.seed >>> 0)) % entries.length]!.id);
    crowd.nextArrivalAt = t + ctx.ticks(between(rng, TUNING.churn.arrivalMs));
    return;
  }
  let live = liveNpcs(world);
  while (live < band.min) {
    spawnNpc(ctx, rng.pick(entries).id);
    live++;
  }
  if (live >= planned) {
    crowd.nextArrivalAt = t + ctx.ticks(between(rng, TUNING.churn.arrivalMs));
  } else if (t >= crowd.nextArrivalAt) {
    spawnNpc(ctx, rng.pick(entries).id);
    crowd.nextArrivalAt = t + ctx.ticks(between(rng, TUNING.churn.arrivalMs));
  }
}

function between(rng: { next(): number }, [lo, hi]: readonly [number, number]): number {
  return lo + (hi - lo) * rng.next();
}
