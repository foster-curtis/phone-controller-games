import { describe, expect, it } from 'vitest';
import { egg, maybeEgg, ofType, setup } from './helpers';

describe('tunneling', () => {
  it('a max-charge slam from 36 evenly spaced angles never passes through a target egg', () => {
    for (let k = 0; k < 36; k++) {
      const theta = (2 * Math.PI * k) / 36;
      // Slammer starts 200 px from the target (at the center) and aims straight at it.
      const sx = Math.cos(theta) * 200;
      const sy = Math.sin(theta) * 200;
      const dir = { x: -Math.cos(theta), y: -Math.sin(theta) };
      const { sim, pads } = setup(['s', 't'], { s: [sx, sy], t: [0, 0] });
      const s = pads.s!;

      // Face the target with one stick sample, then charge to max on a neutral stick.
      s.stick(Math.round(dir.x * 100), Math.round(dir.y * 100));
      sim.step();
      s.stick(0, 0).slamDown();
      for (let i = 0; i < 70; i++) sim.step();
      expect(egg(sim, 's').slamMax).toBe(true);

      s.slamUp();
      let hit = false;
      for (let i = 0; i < 90; i++) {
        const events = sim.step();
        const se = maybeEgg(sim, 's');
        const te = maybeEgg(sim, 't');
        if (ofType(events, 'collision').length > 0) hit = true;
        if (!se || !te) break;
        // The slammer must stay behind the target along the slam direction.
        const along = (se.x - te.x) * dir.x + (se.y - te.y) * dir.y;
        expect(along, `angle #${k} step ${i}`).toBeLessThan(0);
        if (hit) expect(te.vx * dir.x + te.vy * dir.y).toBeGreaterThan(0);
      }
      expect(hit, `angle #${k} never collided`).toBe(true);
      sim.destroy();
    }
  });
});
