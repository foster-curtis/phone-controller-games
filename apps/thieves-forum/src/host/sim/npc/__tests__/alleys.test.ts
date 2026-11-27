// One way at a time through the alleys (SPEC §6.3, §6.10; TF2-fix-1, C1 note on alley jams): an NPC
// meeting oncoming traffic never enters head-on (it goes round or waits beside the mouth), a waiter
// stays out of the mouth and goes in once the alley clears, oncoming players count like NPCs, and
// most NPCs go round rather than wait.
import { afterEach, describe, expect, it } from 'vitest';
import type { Vec2 } from '../../../../content/types';
import { CONTENT } from '../../../../content';
import { quietSim, roundStart, stickDriver } from '../../__tests__/helpers';
import { npc, type NpcMoment } from '..';
import { TUNING } from '../../tuning';
import type { Character, PlayerInput } from '../../types';
import { SIM_HZ } from '../../types';
import { createSim } from '../../world';

const R = CONTENT.layout.alleys[0]!.rect;
const CX = R.x + R.w / 2;
const tuning = TUNING.alley as { reroute: number };
const reroute = tuning.reroute;
afterEach(() => {
  tuning.reroute = reroute;
});

const inAlley = (c: Character) => c.x >= R.x && c.x <= R.x + R.w && c.y >= R.y && c.y <= R.y + R.h;

/** Puts a spawned NPC at `at`, wandering on a roam leg to `to`. */
function place(c: Character, at: Vec2, to: Vec2): Character {
  c.x = at.x;
  c.y = at.y;
  c.vx = 0;
  c.vy = 0;
  c.activity = { k: 'free' };
  c.npc.state = 'wandering';
  c.npc.personality.distractibility = 0;
  const nav = c.npc.nav!;
  nav.leg = 'roam';
  nav.path = [to];
  nav.pauseUntil = 0;
  nav.lastX = at.x;
  nav.lastY = at.y;
  c.npc.goal = to;
  return c;
}

/** A down-walker inside alley 0 and an NPC below it wanting to go up through it. */
function meeting(seed: number) {
  const sim = quietSim(seed);
  const ctx = sim.context();
  const down = place(npc.spawn(ctx, 'upperLeft'), { x: CX, y: 22.5 }, { x: CX, y: 31 });
  const up = place(npc.spawn(ctx, 'lowerLeft'), { x: CX, y: 28 }, { x: CX, y: 17 });
  return { sim, down, up };
}

describe('alleys go one way at a time (TF2-fix-1)', () => {
  it('an NPC never enters head-on against oncoming traffic: it goes round or waits', () => {
    const moments = new Set<NpcMoment>();
    for (let seed = 1; seed <= 12; seed++) {
      const { sim, down, up } = meeting(seed);
      for (let t = 0; t < 8 * SIM_HZ; t++) {
        sim.step();
        moments.add(up.npc.nav!.moment);
        if (inAlley(down) && down.vy > 0.15) expect(inAlley(up)).toBe(false);
      }
    }
    expect(moments.has('alleyReroute')).toBe(true);
    expect(moments.has('alleyWait')).toBe(true);
  });

  it('a waiter stands clear of the mouth, then goes in once the oncoming one is out', () => {
    tuning.reroute = 0;
    const { sim, down, up } = meeting(3);
    let waited = 0;
    let entered = -1;
    let downOut = -1;
    for (let t = 0; t < 12 * SIM_HZ && entered < 0; t++) {
      sim.step();
      const nav = up.npc.nav!;
      if (nav.moment === 'alleyWait' && nav.path.length === 0) {
        waited++;
        // Beside the mouth, not in front of it.
        expect(Math.abs(up.x - CX)).toBeGreaterThan(R.w / 2 + 0.4);
      }
      if (downOut < 0 && !inAlley(down) && down.y > R.y + R.h) downOut = t;
      if (inAlley(up)) entered = t;
    }
    expect(waited).toBeGreaterThan(0);
    expect(downOut).toBeGreaterThan(0);
    expect(entered).toBeGreaterThan(downOut);
  });

  it('counts an oncoming player exactly like an oncoming NPC', () => {
    tuning.reroute = 0;
    const sim = quietSim(5, 1);
    const ctx = sim.context();
    const player = sim.world.characters.find((c) => c.control.k === 'player')!;
    player.x = CX;
    player.y = 22.5;
    const up = place(npc.spawn(ctx, 'lowerLeft'), { x: CX, y: 28 }, { x: CX, y: 17 });
    const inputs = new Map<string, PlayerInput>([
      ['p1', { move: { x: 0, y: 0.6 }, hold: false, catch: false }],
    ]);
    let waited = false;
    for (let t = 0; t < 6 * SIM_HZ; t++) {
      sim.step(inputs);
      if (up.npc.nav!.moment === 'alleyWait') waited = true;
      if (inAlley(player) && player.vy > 0.15) expect(inAlley(up)).toBe(false);
    }
    expect(waited).toBe(true);
  });

  it('most NPCs meeting oncoming traffic go round rather than wait (seeded round)', () => {
    const sim = createSim(roundStart(11, 8));
    const sticks = stickDriver(11, 8);
    const last = new Map<number, NpcMoment>();
    let rerouted = 0;
    let waited = 0;
    for (let t = 0; t < 200 * SIM_HZ; t++) {
      sim.step(sticks(t));
      for (const c of sim.world.characters) {
        if (c.control.k !== 'npc') continue;
        const m = c.npc.nav!.moment;
        const prev = last.get(c.id) ?? 'none';
        // A decision is a fresh alley moment (a wait that times out into going round isn't one).
        if (m !== prev && prev !== 'alleyWait' && prev !== 'alleyReroute') {
          if (m === 'alleyReroute') rerouted++;
          if (m === 'alleyWait') waited++;
        }
        last.set(c.id, m);
      }
    }
    const share = rerouted / (rerouted + waited);
    expect(rerouted + waited).toBeGreaterThan(10);
    expect(share).toBeGreaterThan(reroute - 0.2);
    expect(share).toBeLessThan(Math.min(1, reroute + 0.1));
  });
});
