// FF9-fix-1 (C3 notes, SPEC §2.4 Commander): Lead from the Front shows as amber motes drifting to
// exactly the soldiers its aura reaches (no link lines), and morale flashes its units on and off for
// the buff's duration, timed from the sim.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import type { PlayerColorId } from '../../../shared/ids';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';
import { createSim, ScriptedInputSource } from '../../sim';
import { STEP_MS, type EntityId, type StatusEffect } from '../../sim/types';
import { LEAD_MOTE, leadTargets, MoteStream, SUPER_FLASH, superFlashOn } from '../support';

function commanders(n: number) {
  const pads = Array.from({ length: n }, () => new ScriptedInputSource());
  const sim = createSim(
    {
      seed: 7,
      settings: { theme: 'neon-knights', difficulty: 'normal' },
      slots: pads.map((_, i) => ({
        slot: i,
        name: `P${i + 1}`,
        color: PLAYER_COLOR_IDS[i] as PlayerColorId,
        classId: 'commander' as const,
        connected: true,
      })),
    },
    { sources: new Map(pads.map((p, i) => [i, p] as const)), content },
  );
  const w = sim.world;
  const run = (k: number) => {
    for (let i = 0; i < k; i++) sim.step();
  };
  const phase = () => w.phase;
  while (phase() !== 'build') sim.step();
  for (const p of w.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
  for (let i = 0; i < 5 && phase() !== 'combat'; i++) sim.step();
  expect(phase()).toBe('combat');
  for (const s of w.spawns) s.atTick += 1e7;
  const p = (slot: number) => w.players.find((x) => x.slot === slot)!;
  const squad = (slot: number) => w.soldiers.filter((u) => u.owner === slot);
  return { sim, w, pads, run, p, squad };
}

const leading = (effects: StatusEffect[]) =>
  effects.some((e) => e.def === 'aura_lead_from_the_front');

describe('Lead from the Front motes (C3 note 1)', () => {
  it('emits toward exactly the soldiers in the passive’s effect set, none outside it', () => {
    const h = commanders(2);
    h.p(0).x = 10;
    h.p(0).y = 12;
    h.p(1).x = 24;
    h.p(1).y = 12;
    h.run(120);
    // Commander 1 walks off; his squad holds the flag, so his aura lapses on them.
    h.p(1).x = 36;
    h.p(1).y = 22;
    h.p(1).flag = { x: 24, y: 12 };
    for (const u of h.squad(1)) u.mode = 'rally';
    h.run(30);

    const inSet = new Set(
      h
        .squad(0)
        .filter((u) => leading(u.effects))
        .map((u) => u.id),
    );
    expect(inSet.size).toBeGreaterThan(0);
    expect(h.squad(1).some((u) => leading(u.effects))).toBe(false);
    expect(leadTargets(h.w, 0)).toEqual(inSet);
    expect(leadTargets(h.w, 1).size).toBe(0);

    const streams = [new MoteStream(0), new MoteStream(1)];
    const hit = new Set<EntityId>();
    for (let f = 0; f < 120; f++) {
      h.sim.step();
      for (const slot of [0, 1]) {
        const targets = leadTargets(h.w, slot);
        const { spawned } = streams[slot]!.step(STEP_MS, targets);
        for (const m of [...spawned, ...streams[slot]!.motes]) {
          // Only toward this Commander's soldiers under his aura right now.
          expect(targets.has(m.target)).toBe(true);
          const u = h.w.soldiers.find((x) => x.id === m.target)!;
          expect(u.owner).toBe(slot);
          expect(leading(u.effects)).toBe(true);
          hit.add(m.target);
        }
        // Capped per soldier.
        for (const id of targets)
          expect(streams[slot]!.motes.filter((m) => m.target === id).length).toBeLessThanOrEqual(
            LEAD_MOTE.cap,
          );
      }
    }
    // Every soldier in the set got motes; the walked-off Commander's squad none.
    for (const id of leadTargets(h.w, 0)) expect(hit.has(id)).toBe(true);
    expect(streams[1]!.motes).toHaveLength(0);

    // Commander 0 walks off too: his in-flight motes are dropped and no new ones start.
    h.p(0).x = 36;
    h.p(0).y = 4;
    h.p(0).flag = { x: 10, y: 12 };
    for (const u of h.squad(0)) u.mode = 'rally';
    h.run(30);
    expect(leadTargets(h.w, 0).size).toBe(0);
    const { spawned, removed } = streams[0]!.step(STEP_MS, leadTargets(h.w, 0));
    expect(spawned).toHaveLength(0);
    expect(removed.length).toBeGreaterThan(0);
    expect(streams[0]!.motes).toHaveLength(0);
  });

  it('no link lines: SupportView draws no line from the Commander to his soldiers', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'supportView.ts'), 'utf8');
    expect(src).not.toMatch(/link line/i);
    expect(src).not.toMatch(/lineBetween\(chest/);
    expect(src).toMatch(/fk\('nanite-mote'\)/);
  });
});

describe('morale flash (C3 note 2)', () => {
  it('his units flash on alternating phases for the buff’s exact duration, then stop', () => {
    const h = commanders(1);
    h.p(0).x = 10;
    h.p(0).y = 12;
    h.run(120);
    const total = content.characters
      .find((c) => c.id === 'commander')!
      .super.effects!.find((x) => x.effect === 'morale')!.durationMs;
    h.p(0).superCharge = 1;
    h.pads[0]!.tap('superFires');
    const units = () => [h.p(0), ...h.squad(0).filter((u) => u.hp > 0)];
    const morale = (u: { effects: StatusEffect[] }) => u.effects.find((e) => e.def === 'morale');
    let ticks = 0;
    for (let i = 0; i < 10 && !morale(h.p(0)); i++) h.sim.step();
    const seq: boolean[] = [];
    while (morale(h.p(0))) {
      const states = units().map((u) => superFlashOn(morale(u), total));
      // Every affected unit is in the same phase (one cast).
      expect(new Set(states).size).toBe(1);
      seq.push(states[0]!);
      h.sim.step();
      ticks++;
      expect(ticks).toBeLessThan(1000);
    }
    // It lasts the buff's duration.
    expect(ticks * STEP_MS).toBeGreaterThan(total - 2 * STEP_MS);
    expect(ticks * STEP_MS).toBeLessThanOrEqual(total + STEP_MS);
    // On first, then alternating runs of halfMs.
    expect(seq[0]).toBe(true);
    const runs: { on: boolean; n: number }[] = [];
    for (const s of seq) {
      const last = runs.at(-1);
      if (last && last.on === s) last.n++;
      else runs.push({ on: s, n: 1 });
    }
    const half = Math.round(SUPER_FLASH.halfMs / STEP_MS);
    expect(runs.length).toBeGreaterThanOrEqual(Math.floor(total / SUPER_FLASH.halfMs) - 1);
    runs.forEach((r, i) => {
      expect(r.on).toBe(i % 2 === 0);
      if (i > 0 && i < runs.length - 1) expect(Math.abs(r.n - half)).toBeLessThanOrEqual(1);
    });
    // Off afterwards.
    for (const u of units()) expect(superFlashOn(morale(u), total)).toBe(false);
    h.run(60);
    for (const u of units()) expect(superFlashOn(morale(u), total)).toBe(false);
  });

  it('is off without the buff and caps the glow at the rig’s full boost (bloom budget)', () => {
    expect(superFlashOn(undefined, 6000)).toBe(false);
    const e = (remaining: number): StatusEffect => ({
      def: 'morale',
      strength: 0.35,
      remaining,
      stacks: 1,
      source: null,
    });
    expect(superFlashOn(e(0), 6000)).toBe(false);
    expect(superFlashOn(e(360), 6000)).toBe(true);
    expect(superFlashOn(e(360 - 15), 6000)).toBe(false);
    expect(superFlashOn(e(360 - 30), 6000)).toBe(true);
    expect(SUPER_FLASH.glow).toBeLessThanOrEqual(2);
    expect(SUPER_FLASH.auraAlpha).toBeLessThan(0.6);
  });
});
