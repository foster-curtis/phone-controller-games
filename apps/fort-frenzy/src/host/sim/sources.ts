// Input sources (SPEC §15.3, §15.9): characters only ever read an `InputSource`. Scripted (tests),
// fresh-or-neutral (latest phone sample with the §11.4 staleness rule), replay (recorded samples) and
// autopilot (soak, benchmark, the seed of v2 solo bots).
import { content as defaultContent, type Content } from '../../content';
import { buildPolicies } from './autopilot/builds';
import { dist } from './geometry';
import { neutralInput } from './state';
import type { InputSource, PlayerEnt, PlayerInput, World } from './types';
import { SIM_HZ } from './types';

export { neutralInput };

type Counter = 'mainFires' | 'superFires' | 'buildFires';

function copyInput(i: PlayerInput): PlayerInput {
  return {
    ...i,
    move: { ...i.move },
    mainAim: { ...i.mainAim },
    superAim: { ...i.superAim },
    buildAim: { ...i.buildAim },
  };
}

/**
 * A phone driven by a test: `set` holds fields until changed, `tap` bumps a press counter (the phone's
 * release). An optional script runs before each sample.
 */
export class ScriptedInputSource implements InputSource {
  input: PlayerInput = neutralInput();

  constructor(private readonly script?: (tick: number, pad: ScriptedInputSource) => void) {}

  set(patch: Partial<PlayerInput>): this {
    Object.assign(this.input, patch);
    return this;
  }

  tap(counter: Counter, patch: Partial<PlayerInput> = {}): this {
    this.set(patch);
    this.input[counter]++;
    return this;
  }

  sample(tick: number): PlayerInput {
    this.script?.(tick, this);
    return copyInput(this.input);
  }
}

/**
 * The latest sample pushed by a phone, neutral once older than `staleMs` (§11.4: sticks zeroed,
 * buttons released; counters kept, so nothing fires). Times are steps: the host pushes with the tick
 * the sample arrived at.
 */
export class FreshInputSource implements InputSource {
  private latest: PlayerInput = neutralInput();
  private at = -Infinity;
  private readonly staleSteps: number;

  constructor(staleMs: number) {
    this.staleSteps = Math.round((staleMs * SIM_HZ) / 1000);
  }

  push(input: PlayerInput, tick: number): void {
    this.latest = input;
    this.at = tick;
  }

  sample(tick: number): PlayerInput {
    if (tick - this.at <= this.staleSteps) return this.latest;
    const l = this.latest;
    return {
      ...neutralInput(),
      mainFires: l.mainFires,
      superFires: l.superFires,
      buildFires: l.buildFires,
    };
  }
}

/** Replays recorded samples: the latest one recorded at or before the tick (§15.9). */
export class ReplayInputSource implements InputSource {
  private i = 0;
  private current: PlayerInput = neutralInput();

  constructor(private readonly samples: readonly (readonly [tick: number, input: PlayerInput])[]) {}

  sample(tick: number): PlayerInput {
    // Ticks only move forward in a replay; rewind if asked for an earlier one.
    if (this.i > 0 && this.samples[this.i - 1]![0] > tick) {
      this.i = 0;
      this.current = neutralInput();
    }
    while (this.i < this.samples.length && this.samples[this.i]![0] <= tick) {
      this.current = this.samples[this.i]![1];
      this.i++;
    }
    return this.current;
  }
}

/**
 * Plays a knight headless (§15.9): walk toward the nearest enemy, fire on cooldown, fall back toward
 * the base when hurt, wait near the base in the build phase. Deterministic: reads only the world and
 * its own counters. Builds follow the knight's policy (`autopilot/builds.ts`; none = no builds).
 */
export class AutopilotInputSource implements InputSource {
  private counters = { mainFires: 0, superFires: 0, buildFires: 0 };
  private shots = 0;

  constructor(
    private readonly world: () => World,
    private readonly slot: number,
    private readonly content: Content = defaultContent,
  ) {}

  sample(tick: number): PlayerInput {
    const out = { ...neutralInput(), ...this.counters };
    const w = this.world();
    const p = w.players.find((q) => q.slot === this.slot);
    if (!p || p.respawnAt !== null || !p.connected) return out;
    const def = this.content.knights.find((c) => c.id === p.classId);
    if (!def) return out;
    const map = this.content.map!;
    const home = {
      x: map.cols / 2 + ((this.slot % 3) - 1) * 3,
      y: map.rows * 0.55 + Math.floor(this.slot / 3) * 2,
    };
    if (w.phase === 'build') {
      out.move = toward(p, home.x, home.y);
      return out;
    }
    if (w.phase !== 'combat') return out;

    // Only what the main attack can hit: a melee knight under a Flyer would stand there forever
    // (FF15 soak: invincible, it holds the Flyers' aggro and the wave never ends). Same for an enemy
    // outside the field further than the main attack reaches from its edge: a Siege that set up
    // before walking in shells a melee knight at the edge forever (RD14 solo soak); left alone, it
    // loses its target and walks in.
    let nearest = null as (typeof w.enemies)[number] | null;
    let nd = Infinity;
    const reach = def.main.range * 0.8;
    for (const e of w.enemies) {
      if (e.hp <= 0 || (e.flying && !def.main.hitsFlyers)) continue;
      const ox = e.x - Math.min(Math.max(e.x, 0), map.cols);
      const oy = e.y - Math.min(Math.max(e.y, 0), map.rows);
      if (ox * ox + oy * oy > reach * reach) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < nd) {
        nd = d;
        nearest = e;
      }
    }
    const tap = (c: Counter) => {
      this.counters[c]++;
      out[c] = this.counters[c];
    };

    if (p.hp < p.maxHp * 0.35 && !p.invincible) {
      out.move = toward(p, map.cols / 2, 4);
      return out;
    }
    if (!nearest) {
      out.move = toward(p, home.x, home.y);
      return out;
    }
    const range = def.main.range;
    if (nd > range * 0.8) out.move = toward(p, nearest.x, nearest.y);
    else if (nd < 2.5) out.move = away(p, nearest.x, nearest.y);
    if (p.main.readyAt <= tick && !p.main.queued) {
      // Alternate aimed shots and auto-aim taps.
      this.shots++;
      const aim = this.shots % 2 === 0 ? { x: 0, y: 0 } : unit(nearest.x - p.x, nearest.y - p.y);
      out.mainAim = aim;
      tap('mainFires');
    }
    if (p.superCharge >= 1 && nd < 2.5) tap('superFires');
    const policy = buildPolicies[def.id];
    const build = this.content.builds.find((b) => b.id === def.build);
    if (policy && build) {
      const press = policy({ world: w, self: p, knight: def, build, nearest, nearestDist: nd });
      if (press) {
        out.buildAim = press.aim;
        tap('buildFires');
      }
    }
    return out;
  }
}

function unit(x: number, y: number) {
  const l = Math.sqrt(x * x + y * y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: x / l, y: y / l };
}

function toward(p: PlayerEnt, x: number, y: number) {
  return dist(p.x, p.y, x, y) < 0.25 ? { x: 0, y: 0 } : unit(x - p.x, y - p.y);
}

function away(p: PlayerEnt, x: number, y: number) {
  return unit(p.x - x, p.y - y);
}
