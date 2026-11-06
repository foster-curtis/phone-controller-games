// Input sources (SPEC §15.3, §15.9): characters only ever read an `InputSource`. Scripted (tests),
// fresh-or-neutral (latest phone sample with the §11.4 staleness rule), replay (recorded samples) and
// autopilot (soak, benchmark, the seed of v2 solo bots).
import { content as defaultContent, type Content } from '../../content';
import { placementValid } from './building';
import { dist } from './geometry';
import { neutralInput } from './state';
import type { InputSource, PlayerEnt, PlayerInput, World } from './types';
import { SIM_HZ } from './types';

export { neutralInput };

type Counter = 'mainFires' | 'superFires' | 'actionTaps' | 'radialCommits';

function copyInput(i: PlayerInput): PlayerInput {
  return { ...i, move: { ...i.move }, mainAim: { ...i.mainAim }, superAim: { ...i.superAim } };
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
      actionTaps: l.actionTaps,
      radialCommits: l.radialCommits,
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
 * Plays a character headless (§15.9): walk toward the nearest enemy, fire on cooldown, fall back toward
 * the base when hurt; buy crates at the Armory pad and drop turrets on the way. Deterministic: reads
 * only the world and its own counters.
 */
export class AutopilotInputSource implements InputSource {
  private counters = { mainFires: 0, superFires: 0, actionTaps: 0, radialCommits: 0 };
  private lastAction = -Infinity;
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
    const def = this.content.characters.find((c) => c.id === p.classId);
    if (!def) return out;
    const map = this.content.map!;
    const price = this.content.shop.find((s) => s.id === 'crate')?.tiers[0]?.price ?? Infinity;
    const kit = def.build[0];
    const cost = kit ? (this.content.structures.find((s) => s.id === kit)?.cost ?? 99) : 99;
    const depot = findTile(map.tiles, map.legend, 'armory');
    const home = {
      x: map.cols / 2 + ((this.slot % 3) - 1) * 3,
      y: map.rows * 0.55 + Math.floor(this.slot / 3) * 2,
    };

    // Only what the main attack can hit: a melee knight under a Flyer would stand there forever
    // (FF15 soak: invincible, it holds the Flyers' aggro and the wave never ends).
    let nearest = null as (typeof w.enemies)[number] | null;
    let nd = Infinity;
    for (const e of w.enemies) {
      if (e.hp <= 0 || (e.flying && !def.main.hitsFlyers)) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < nd) {
        nd = d;
        nearest = e;
      }
    }

    const wantsCrates = kit !== undefined && p.crates < cost && w.team.coins >= price;
    const safe = nd > 8;
    const tap = (c: Counter) => {
      this.counters[c]++;
      out[c] = this.counters[c];
    };

    if (w.phase === 'build' || (w.phase === 'combat' && wantsCrates && safe)) {
      if (wantsCrates && depot) {
        if (Math.floor(p.x) === depot.x && Math.floor(p.y) === depot.y) {
          if (tick - this.lastAction >= 10) {
            this.lastAction = tick;
            tap('actionTaps');
          }
        } else {
          out.move = toward(p, depot.x + 0.5, depot.y + 0.5);
        }
        return out;
      }
      if (w.phase === 'build') {
        out.move = toward(p, home.x, home.y);
        return out;
      }
    }
    if (w.phase !== 'combat') return out;

    if (p.hp < p.maxHp * 0.35 && !p.invincible) {
      out.move = toward(p, map.cols / 2, 4);
      return out;
    }

    // Drop a turret where we stand when carrying enough and nothing is close.
    if (kit && p.crates >= cost && nd > 4 && tick - this.lastAction >= 30) {
      const tile: [number, number] = [Math.floor(p.x), Math.floor(p.y)];
      const crowded = w.structures.some((s) => dist(s.x, s.y, p.x, p.y) < 3);
      if (!crowded && tile[1] > 5 && placementValid(w, kit, tile, p.slot)) {
        this.lastAction = tick;
        tap('actionTaps');
      }
    }

    if (!nearest) {
      out.move = toward(p, home.x, home.y);
      return out;
    }
    const range = def.main.range;
    if (nd > range * 0.8) out.move = toward(p, nearest.x, nearest.y);
    else if (nd < 2.5) out.move = away(p, nearest.x, nearest.y);
    else if (def.main.blockedBy && shotBlocked(w, p, nearest, def.main.blockedBy)) {
      // A wall or tower eats the shots (FF15 soak): sidestep, switching sides every 2 s.
      const side = (Math.floor(tick / 120) + this.slot) % 2 === 0 ? 1 : -1;
      const d = unit(nearest.x - p.x, nearest.y - p.y);
      out.move = { x: -d.y * side, y: d.x * side };
    }
    if (p.main.readyAt <= tick && !p.main.queued) {
      // Alternate aimed shots and auto-aim taps.
      this.shots++;
      const aim = this.shots % 2 === 0 ? { x: 0, y: 0 } : unit(nearest.x - p.x, nearest.y - p.y);
      out.mainAim = aim;
      tap('mainFires');
    }
    if (p.superCharge >= 1 && nd < 2.5) tap('superFires');
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

/** Whether a structure the shot stops at (`blockedBy`) stands on the line to `to` (quarter-tile steps). */
function shotBlocked(
  w: World,
  from: { x: number; y: number },
  to: { x: number; y: number },
  blockedBy: readonly string[],
): boolean {
  const { cols, rows, occupant } = w.grid;
  const n = Math.ceil(dist(from.x, from.y, to.x, to.y) * 4);
  for (let i = 1; i < n; i++) {
    const c = Math.floor(from.x + ((to.x - from.x) * i) / n);
    const r = Math.floor(from.y + ((to.y - from.y) * i) / n);
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    const id = occupant[r * cols + c]!;
    if (id === 0) continue;
    const st = w.structures.find((s) => s.id === id);
    if (!st) continue;
    const what = st.kind === 'wall' ? 'wall' : st.kind.endsWith('_tower') ? 'tower' : null;
    if (what !== null && blockedBy.includes(what)) return true;
  }
  return false;
}

function findTile(tiles: readonly string[], legend: Record<string, string>, kind: string) {
  for (let r = 0; r < tiles.length; r++) {
    const row = tiles[r]!;
    for (let c = 0; c < row.length; c++) if (legend[row[c]!] === kind) return { x: c, y: r };
  }
  return null;
}
