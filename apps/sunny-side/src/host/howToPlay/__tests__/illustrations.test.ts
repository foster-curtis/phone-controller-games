import { describe, expect, it } from 'vitest';
import { card1Script } from '../card1';
import { card2Script } from '../card2';
import { card3Script } from '../card3';
import type { IllustrationScript } from '../types';
import { assertClean, createFakeScene } from './fakeScene';

describe.each([card1Script, card2Script, card3Script] as IllustrationScript[])(
  'illustration $id',
  (script) => {
    it('loops in 3.5 to 6.5 s and stills inside the loop', () => {
      expect(script.loopMs).toBeGreaterThanOrEqual(3500);
      expect(script.loopMs).toBeLessThanOrEqual(6500);
      expect(script.stillMs).toBeGreaterThanOrEqual(0);
      expect(script.stillMs).toBeLessThan(script.loopMs);
    });

    it('creates, draws across the loop, destroys and leaves nothing alive', () => {
      const fake = createFakeScene();
      const rig = script.create(fake.scene);
      expect(fake.objects.length).toBeGreaterThan(0);
      for (let t = 0; t < script.loopMs; t += 200) rig.draw(t);
      rig.draw(script.loopMs - 1);
      rig.draw(script.stillMs);
      rig.destroy();
      assertClean(fake);
      expect(fake.live).toEqual({ timers: 0, tweens: 0 });
    });

    it('draws only finite numbers', () => {
      const fake = createFakeScene();
      const rig = script.create(fake.scene);
      for (let t = 0; t < script.loopMs; t += 250) rig.draw(t);
      for (const o of fake.objects) {
        for (const [, args] of o.calls) {
          for (const a of args) if (typeof a === 'number') expect(Number.isFinite(a)).toBe(true);
        }
      }
      rig.destroy();
    });
  },
);
