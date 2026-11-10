// Peak loads (FF15, sim/peak.ts): the bench and the TV's stress mode hold the SPEC §15.2 counts, and
// the real peak keeps the Colossus Mk III in its final phase, alive.
import { describe, expect, it } from 'vitest';
import { PEAK, peakLoad } from '../peak';

describe('peak loads', () => {
  for (const kind of ['boss', 'synthetic'] as const) {
    it(`${kind}: holds the §15.2 counts`, () => {
      const load = peakLoad(kind, 3);
      const w = load.sim.world;
      for (let i = 0; i < 240; i++) {
        load.topUp();
        load.sim.step();
      }
      load.topUp();
      expect(w.players).toHaveLength(PEAK.knights);
      expect(w.soldiers).toHaveLength(PEAK.footmen);
      expect(w.structures).toHaveLength(PEAK.structures);
      expect(w.enemies.length).toBeGreaterThanOrEqual(PEAK.enemies - 10);
      expect(w.projectiles.length).toBeGreaterThanOrEqual(PEAK.projectiles);
      expect(w.phase).toBe('combat');
      if (kind === 'boss') {
        expect(w.wave).toBe(15);
        expect(load.colossus?.boss?.mk).toBe(3);
        expect(load.colossus?.boss?.finalPhase).toBe(true);
        expect(load.colossus!.hp).toBeGreaterThan(0);
      }
    }, 30_000);
  }
});
