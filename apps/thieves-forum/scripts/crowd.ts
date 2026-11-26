// Seeded crowd run (SPEC §6.10, §12.9; BUILD_PLAN TF2): runs one round headless with stick-wandering
// players and prints JSON metrics — the live NPC count's min/max per second (after the stream-in),
// the longest any NPC stood still, a path-curvature histogram, NPC–NPC overlaps, arrivals and exits.
// Exits non-zero if an NPC stood still longer than 8 s, an overlap went deeper than 50% of a radius,
// or the live count left its ±8% band.
//
//   pnpm --filter @pcg/thieves-forum exec tsx scripts/crowd.ts --seed 1 --players 8 --seconds 270
import { rngStream } from '@pcg/game-kit';
import { CONTENT } from '../src/content';
import { bandFor } from '../src/host/sim/npc';
import type { PlayerInput } from '../src/host/sim/types';
import { SIM_HZ } from '../src/host/sim/types';
import { createSim } from '../src/host/sim/world';

const STILL_LIMIT_S = 8;
const DEEP = 0.5;

function arg(name: string, def: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : def;
}

export function runCrowd(seed: number, players: number, seconds: number) {
  const ids = Array.from({ length: players }, (_, i) => `p${i + 1}`);
  const sim = createSim({
    seed,
    round: 1,
    players: ids.map((id) => ({ id, side: { kind: 'player' as const, id } })),
    openStalls: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].slice(0, Math.min(10, Math.max(5, players + 2))),
    guards: 1,
  });
  const b = CONTENT.balance;
  const band = bandFor(sim.world.plannedNpcs, b);
  const openingTicks = Math.round((b.match.openingMs / 1000) * SIM_HZ);
  const settle = openingTicks + Math.round((b.npcs.streamInMs / 1000) * SIM_HZ) + SIM_HZ;
  const total = openingTicks + seconds * SIM_HZ;
  // Players: seeded wanderers that change stick every 1–4 s, mostly at walking pace.
  const prng = rngStream(seed, 'crowd-script');
  const sticks = new Map<string, PlayerInput>();
  const nextChange = new Map<string, number>();
  const still = new Map<number, number>();
  const last = new Map<number, { x: number; y: number; h: number | null }>();
  let maxStill = 0;
  let minLive = Infinity;
  let maxLive = -Infinity;
  const perSecond: { s: number; min: number; max: number }[] = [];
  let secMin = Infinity;
  let secMax = -Infinity;
  let overlaps = 0;
  let deep = 0;
  let maxDepth = 0;
  let arrivals = 0;
  let exits = 0;
  // Heading change per 0.5 s of walking, degrees: bins 0–5, 5–15, 15–30, 30–60, 60–90, 90+.
  const curv = [0, 0, 0, 0, 0, 0];
  const edges = [5, 15, 30, 60, 90];
  for (let t = 0; t < total; t++) {
    for (const id of ids) {
      if ((nextChange.get(id) ?? 0) <= t) {
        const a = prng.next() * 2 * Math.PI;
        const m = prng.next() < 0.15 ? 0 : prng.next() < 0.1 ? 1 : 0.45 + prng.next() * 0.35;
        sticks.set(id, {
          move: { x: Math.cos(a) * m, y: Math.sin(a) * m },
          hold: false,
          catch: false,
        });
        nextChange.set(id, t + prng.int(60, 240));
      }
    }
    sim.step(sticks);
    for (const e of sim.events()) {
      if (e.ch === 'tv' && e.e === 'enter') arrivals++;
      if (e.ch === 'tv' && e.e === 'exit') exits++;
    }
    const npcs = sim.world.characters.filter((c) => c.control.k === 'npc');
    for (const c of npcs) {
      const l = last.get(c.id);
      const moved = l ? Math.hypot(c.x - l.x, c.y - l.y) : 1;
      const n = moved < 0.002 ? (still.get(c.id) ?? 0) + 1 : 0;
      still.set(c.id, n);
      maxStill = Math.max(maxStill, n / SIM_HZ);
      if (t % 30 === 0) {
        const sp = Math.hypot(c.vx, c.vy);
        const h = sp > 0.8 ? Math.atan2(c.vy, c.vx) : null;
        if (h !== null && l?.h != null) {
          let d = Math.abs(h - l.h) % (2 * Math.PI);
          if (d > Math.PI) d = 2 * Math.PI - d;
          const deg = (d * 180) / Math.PI;
          curv[edges.findIndex((x) => deg < x) === -1 ? 5 : edges.findIndex((x) => deg < x)]!++;
        }
        last.set(c.id, { x: c.x, y: c.y, h });
      } else last.set(c.id, { x: c.x, y: c.y, h: l?.h ?? null });
    }
    for (let i = 0; i < npcs.length; i++)
      for (let j = i + 1; j < npcs.length; j++) {
        const a = npcs[i]!;
        const o = npcs[j]!;
        const depth = a.r + o.r - Math.hypot(a.x - o.x, a.y - o.y);
        if (depth > 0) {
          overlaps++;
          maxDepth = Math.max(maxDepth, depth / a.r);
          if (depth > DEEP * a.r) deep++;
        }
      }
    if (t >= settle) {
      secMin = Math.min(secMin, npcs.length);
      secMax = Math.max(secMax, npcs.length);
      if ((t + 1) % SIM_HZ === 0) {
        perSecond.push({ s: (t + 1) / SIM_HZ, min: secMin, max: secMax });
        minLive = Math.min(minLive, secMin);
        maxLive = Math.max(maxLive, secMax);
        secMin = Infinity;
        secMax = -Infinity;
      }
    }
  }
  return {
    seed,
    players,
    seconds,
    planned: sim.world.plannedNpcs,
    band: [band.min, band.max],
    live: { min: minLive, max: maxLive },
    liveBySecond: perSecond.map((p) => [p.min, p.max]),
    maxStillS: Math.round(maxStill * 100) / 100,
    curvatureDegPerHalfSecond: {
      bins: ['<5', '5-15', '15-30', '30-60', '60-90', '90+'],
      counts: curv,
    },
    overlaps: {
      pairTicks: overlaps,
      deeperThanHalfRadius: deep,
      maxDepthRadii: Math.round(maxDepth * 1000) / 1000,
    },
    arrivals,
    exits,
    hash: sim.hash().toString(16),
    ok: maxStill <= STILL_LIMIT_S && deep === 0 && minLive >= band.min && maxLive <= band.max,
  };
}

const r = runCrowd(arg('seed', 1), arg('players', 8), arg('seconds', 270));
console.log(JSON.stringify(r));
process.exit(r.ok ? 0 : 1);
