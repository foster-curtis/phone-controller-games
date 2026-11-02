// Determinism (SPEC §15.3, §15.9): the same seed and inputs, run twice, give identical state hashes.
import { describe, expect, it } from 'vitest';
import { AutopilotInputSource, createSim, ScriptedInputSource, stateHash } from '../index';
import type { InputSource } from '../types';
import { startOf } from './harness';

/** A phone that wanders, aims and fires on a fixed schedule (a pure function of the tick). */
function wanderer(slot: number): ScriptedInputSource {
  return new ScriptedInputSource((tick, pad) => {
    const t = tick + slot * 37;
    const a = (t % 240) / 240;
    pad.set({ move: t % 300 < 200 ? { x: a * 2 - 1, y: 1 - a * 2 } : { x: 0, y: 0 } });
    if (t % 45 === 0) pad.tap('mainFires', { mainAim: { x: 0, y: 0 } });
    if (t % 70 === 0) pad.tap('mainFires', { mainAim: { x: a - 0.5, y: 0.9 } });
    if (t % 400 === 0) pad.tap('superFires');
    if (t % 150 === 0) pad.tap('actionTaps');
  });
}

function runHashes(
  seed: number,
  mk: (slot: number, sim: ReturnType<typeof createSim>) => InputSource,
) {
  const start = startOf(2, seed);
  const sim = createSim(start);
  for (const s of start.slots) sim.setSource(s.slot, mk(s.slot, sim));
  // Invincible players, so both waves run to the end however the inputs play.
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  const hashes: number[] = [];
  let maxWave = 0;
  for (let i = 0; i < 60 * 60 * 6 && sim.world.phase !== 'summary'; i++) {
    if (sim.world.phase === 'build' && sim.world.tick % 600 === 300) {
      for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
    }
    sim.step();
    if (sim.world.phase === 'combat') maxWave = Math.max(maxWave, sim.world.wave);
    if (sim.world.tick % 60 === 0) hashes.push(stateHash(sim.world));
  }
  return { hashes, maxWave, phase: sim.world.phase, tick: sim.world.tick };
}

describe('determinism', () => {
  it('same seed + scripted inputs twice → identical hashes over 2 waves', () => {
    const a = runHashes(7, (slot) => wanderer(slot));
    const b = runHashes(7, (slot) => wanderer(slot));
    expect(a.maxWave).toBe(2);
    expect(a.hashes.length).toBeGreaterThan(30);
    expect(b.hashes).toEqual(a.hashes);
  });

  it('same seed + autopilot twice → identical hashes over 2 waves', () => {
    const mk = (slot: number, sim: ReturnType<typeof createSim>) =>
      new AutopilotInputSource(() => sim.world, slot);
    const a = runHashes(11, mk);
    const b = runHashes(11, mk);
    expect(a.maxWave).toBe(2);
    expect(a.phase).toBe('summary');
    expect(b.hashes).toEqual(a.hashes);
  });

  it('a different seed gives a different run', () => {
    const a = runHashes(3, (slot) => wanderer(slot));
    const b = runHashes(4, (slot) => wanderer(slot));
    expect(b.hashes).not.toEqual(a.hashes);
  });

  it('the hash covers state: moving one player changes it', () => {
    const sim = createSim(startOf(1, 1));
    const h0 = stateHash(sim.world);
    expect(stateHash(sim.world)).toBe(h0);
    sim.world.players[0]!.x += 0.001;
    expect(stateHash(sim.world)).not.toBe(h0);
  });
});
