import { describe, expect, it } from 'vitest';
import { SIM_CONFIG } from '../config';
import { GHOST_SPAWN_STEPS, PULSE_COOLDOWN_STEPS, PULSE_WINDUP_STEPS } from '../ghost';
import { BUTTON_DASH, BUTTON_SLAM } from '../../../shared/messages';
import { egg, ghost, makeGhost, ofType, pushOut, run, setup } from './helpers';

const place = { a: [-120, 0], b: [120, 0], g: [0, 150] } as Record<string, [number, number]>;

function withGhost() {
  const s = setup(['a', 'b', 'g'], place);
  makeGhost(s.sim, 'g');
  return s;
}

describe('ghosts', () => {
  it('ghostSpawned comes exactly 5 s after elimination, at the arena center', () => {
    expect(GHOST_SPAWN_STEPS).toBe(300);
    const { sim } = setup(['a', 'b', 'g'], place);
    const out = ofType(pushOut(sim, 'g'), 'eliminated');
    expect(out).toEqual([
      { type: 'eliminated', id: 'g', by: null, byGhost: false, respawnMs: 5000 },
    ]);
    const tOut = sim.snapshot().tick;
    let spawnedAt = -1;
    for (let i = 0; i < 400 && spawnedAt < 0; i++) {
      const ev = sim.step();
      expect(sim.snapshot().ghosts.length).toBe(ofType(ev, 'ghostSpawned').length ? 1 : 0);
      if (ofType(ev, 'ghostSpawned').length) spawnedAt = sim.snapshot().tick;
    }
    expect(spawnedAt - tOut).toBe(300);
    expect(spawnedAt - tOut).toBe(SIM_CONFIG.ghost.spawnDelayMs / (1000 / 60));
    const g = ghost(sim, 'g');
    expect(Math.hypot(g.x, g.y)).toBeLessThan(1);
  });

  it('pass through eggs (sensor): no collision response, no collision events', () => {
    const s = withGhost();
    s.sim.setFrozen('a', true);
    s.sim.place('g', -220, 0);
    s.pads.g!.stick(100, 0);
    const events = run(s.sim, 90);
    expect(ghost(s.sim, 'g').x).toBeGreaterThan(egg(s.sim, 'a').x + 60); // went straight through a
    expect(egg(s.sim, 'a').vx).toBe(0);
    expect(egg(s.sim, 'a').vy).toBe(0);
    expect(egg(s.sim, 'a').x).toBe(-120);
    expect(ofType(events, 'collision')).toHaveLength(0);
  });

  it('are clamped inside the current radius', () => {
    const s = withGhost();
    s.pads.g!.stick(100, 0);
    run(s.sim, 200);
    const g = ghost(s.sim, 'g');
    expect(Math.hypot(g.x, g.y)).toBeLessThanOrEqual(s.sim.snapshot().arena.radius + 1e-6);
    expect(g.x).toBeGreaterThan(s.sim.snapshot().arena.radius - 5);
  });

  it('a pulse has a 0.4 s wind-up visible in the snapshot, then fires once', () => {
    expect(PULSE_WINDUP_STEPS).toBe(24);
    const s = withGhost();
    expect(ghost(s.sim, 'g').windup).toBe(0);
    s.pads.g!.dash();
    const windups: number[] = [];
    let firedAfter = -1;
    for (let i = 0; i < 40; i++) {
      const ev = s.sim.step();
      if (ofType(ev, 'pulse').length) {
        expect(firedAfter).toBe(-1);
        firedAfter = i;
      }
      windups.push(ghost(s.sim, 'g').windup);
    }
    expect(firedAfter).toBe(24); // fired on the 25th step after the press
    expect(windups.slice(0, 24).every((w) => w > 0 && w <= 1)).toBe(true);
    for (let i = 1; i < 24; i++) expect(windups[i]!).toBeGreaterThan(windups[i - 1]!);
    expect(windups[23]).toBe(1);
    expect(windups.slice(24).every((w) => w === 0)).toBe(true);
  });

  it('the pulse impulse is ≈ ⅓ of a dash and pushes away from the ghost', () => {
    // Dash reference.
    const d = setup(['a', 'b'], { a: [-120, 0], b: [120, 0] });
    d.pads.a!.stick(100, 0).dash();
    d.sim.step();
    const dashDv = egg(d.sim, 'a').vx;

    const s = withGhost();
    s.sim.place('g', -170, 0); // 50 px left of a
    s.pads.g!.dash();
    run(s.sim, PULSE_WINDUP_STEPS);
    expect(egg(s.sim, 'a').vx).toBe(0);
    expect(ofType(s.sim.step(), 'pulse')).toHaveLength(1);
    const a = egg(s.sim, 'a');
    expect(a.vx / dashDv).toBeGreaterThan(0.3);
    expect(a.vx / dashDv).toBeLessThan(0.37);
    expect(Math.abs(a.vy)).toBeLessThan(1e-6);
    expect(egg(s.sim, 'b').vx).toBe(0); // out of range
  });

  it('has a 4 s cooldown after firing (presses during it are ignored)', () => {
    expect(PULSE_COOLDOWN_STEPS).toBe(240);
    const s = withGhost();
    const g = s.pads.g!;
    g.dash();
    run(s.sim, PULSE_WINDUP_STEPS + 1); // fired on the last of these steps
    expect(ghost(s.sim, 'g').cooldown).toBe(1);
    run(s.sim, 238);
    g.slam(); // 239 steps after firing
    s.sim.step();
    expect(ghost(s.sim, 'g').windup).toBe(0);
    expect(ghost(s.sim, 'g').cooldown).toBeGreaterThan(0);
    g.dash(); // 240 steps after firing → accepted
    s.sim.step();
    expect(ghost(s.sim, 'g').cooldown).toBe(0);
    expect(ghost(s.sim, 'g').windup).toBeGreaterThan(0);
  });

  it('either button pulses; a held button gives exactly one pulse (no charge)', () => {
    const s = withGhost();
    const g = s.pads.g!;
    g.slamDown(); // SLAM press, then held for 10 s
    let events = run(s.sim, 600);
    expect(ofType(events, 'pulse')).toHaveLength(1);
    expect(ofType(events, 'slam')).toHaveLength(0);
    g.slamUp();
    g.buttons = BUTTON_DASH | BUTTON_SLAM;
    g.dashCount += 1;
    g.send();
    events = run(s.sim, 600);
    expect(ofType(events, 'pulse')).toHaveLength(1);
  });
});
