// Seeded crowd run (SPEC §6.10, §12.9; BUILD_PLAN TF2): runs one round headless with stick-wandering
// players and prints JSON metrics — the live NPC count's min/max per second (after the stream-in),
// the longest any NPC stood still, a path-curvature histogram, NPC–NPC overlaps, arrivals and exits,
// and (TF2-fix-1) hesitation: stops per minute (all, and mid-walk ones away from a counter), sharp
// turns (> 90°) per minute and mean stop duration, for the NPCs and for the stick-driven players;
// and alley traffic: the most NPCs in one alley at once and head-on meetings (two characters in the
// same alley moving opposite ways), NPC–NPC and any. Also fails on an NPC–NPC head-on meeting or more
// than 3 NPCs in one alley.
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
/** Stop/turn tracking (TF2-fix-1): moving above `GO`, stopped below `HALT` (tiles/s). */
const GO = 0.5;
const HALT = 0.1;
/** Shortest stop that counts, s; heading sample interval, ticks; turn look-back, samples / s. */
const MIN_STOP_S = 0.2;
const TURN_SAMPLE = 15;
const TURN_HISTORY = 6;
const TURN_WINDOW_S = 4;
/** Alley traffic (TF2-fix-1): moving along an alley above this |vy| (tiles/s); limits. */
const ALLEY_V = 0.15;
const ALLEY_MAX = 3;

/** Per-character stop and sharp-turn counter (headings sampled every `TURN_SAMPLE` ticks). */
interface Track {
  moving: boolean;
  stopStart: number;
  stopAtCounter: boolean;
  hist: { t: number; h: number }[];
  quietUntil: number;
}

interface Tally {
  ticks: number;
  stops: number;
  walkStops: number;
  stopTicks: number;
  walkStopTicks: number;
  turns: number;
}

const newTally = (): Tally => ({
  ticks: 0,
  stops: 0,
  walkStops: 0,
  stopTicks: 0,
  walkStopTicks: 0,
  turns: 0,
});

function trackStep(
  tracks: Map<number, Track>,
  tally: Tally,
  id: number,
  t: number,
  vx: number,
  vy: number,
  atCounter: boolean,
): void {
  let k = tracks.get(id);
  if (!k) {
    k = { moving: false, stopStart: -1, stopAtCounter: false, hist: [], quietUntil: 0 };
    tracks.set(id, k);
  }
  tally.ticks++;
  const sp = Math.hypot(vx, vy);
  if (k.moving && sp < HALT) {
    k.moving = false;
    k.stopStart = t;
    k.stopAtCounter = atCounter;
  } else if (!k.moving && sp > GO) {
    if (k.stopStart >= 0 && t - k.stopStart >= MIN_STOP_S * SIM_HZ) {
      const d = t - k.stopStart;
      tally.stops++;
      tally.stopTicks += d;
      if (!k.stopAtCounter) {
        tally.walkStops++;
        tally.walkStopTicks += d;
      }
    }
    k.moving = true;
    k.stopStart = -1;
  }
  if (t % TURN_SAMPLE !== 0 || sp <= GO) return;
  const h = Math.atan2(vy, vx);
  k.hist = k.hist.filter((s) => t - s.t <= TURN_WINDOW_S * SIM_HZ);
  if (t >= k.quietUntil) {
    for (const s of k.hist) {
      let d = Math.abs(h - s.h) % (2 * Math.PI);
      if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > Math.PI / 2) {
        tally.turns++;
        k.hist = [];
        k.quietUntil = t + 1.5 * SIM_HZ;
        break;
      }
    }
  }
  k.hist.push({ t, h });
  if (k.hist.length > TURN_HISTORY) k.hist.shift();
}

function summary(x: Tally) {
  const min = x.ticks / SIM_HZ / 60;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    minutes: r2(min),
    stopsPerMin: r2(x.stops / min),
    walkStopsPerMin: r2(x.walkStops / min),
    sharpTurnsPerMin: r2(x.turns / min),
    meanStopS: r2(x.stops ? x.stopTicks / x.stops / SIM_HZ : 0),
    meanWalkStopS: r2(x.walkStops ? x.walkStopTicks / x.walkStops / SIM_HZ : 0),
  };
}

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
  const tracks = new Map<number, Track>();
  const alleys = CONTENT.layout.alleys.map((a) => a.rect);
  let alleyMax = 0;
  let headOnNpc = 0;
  let headOnAny = 0;
  const meeting = new Set<string>();
  const npcTally = newTally();
  const playerTally = newTally();
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
    if (sim.world.phase === 'play')
      for (const c of sim.world.characters) {
        const a = c.activity.k;
        if (a === 'entering' || a === 'leaving') continue;
        const tally = c.control.k === 'npc' ? npcTally : playerTally;
        trackStep(tracks, tally, c.id, t, c.vx, c.vy, a === 'browsing');
      }
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
    alleys.forEach((r, ai) => {
      const inside = sim.world.characters.filter(
        (c) => c.x >= r.x && c.x <= r.x + r.w && c.y >= r.y && c.y <= r.y + r.h,
      );
      alleyMax = Math.max(alleyMax, inside.filter((c) => c.control.k === 'npc').length);
      for (const a of inside)
        for (const o of inside) {
          if (o.id <= a.id || !(Math.abs(a.vy) > ALLEY_V && Math.abs(o.vy) > ALLEY_V)) continue;
          if (Math.sign(a.vy) === Math.sign(o.vy)) continue;
          const key = `${ai}:${a.id}:${o.id}`;
          if (meeting.has(key)) continue;
          meeting.add(key);
          headOnAny++;
          if (a.control.k === 'npc' && o.control.k === 'npc') headOnNpc++;
        }
    });
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
    hesitation: { npcs: summary(npcTally), players: summary(playerTally) },
    alleys: { maxNpcsInOne: alleyMax, headOnNpcNpc: headOnNpc, headOnAny },
    hash: sim.hash().toString(16),
    ok:
      maxStill <= STILL_LIMIT_S &&
      deep === 0 &&
      minLive >= band.min &&
      maxLive <= band.max &&
      headOnNpc === 0 &&
      alleyMax <= ALLEY_MAX,
  };
}

const r = runCrowd(arg('seed', 1), arg('players', 8), arg('seconds', 270));
console.log(JSON.stringify(r));
process.exit(r.ok ? 0 : 1);
