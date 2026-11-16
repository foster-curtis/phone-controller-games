// Cards 4-6 illustrations (SPEC §6.9): headless create/draw/destroy through the fake scene, loop
// ranges, and a few cheap pure frame facts.
import { describe, expect, it } from 'vitest';
import { card4Script, shrinkRadius } from '../card4';
import { card5Script, scoreLabelAt } from '../card5';
import { card6Script, countdownAt } from '../card6';
import type { IllustrationScript } from '../types';
import { assertClean, createFakeScene } from './fakeScene';

const scripts: IllustrationScript[] = [card4Script, card5Script, card6Script];

describe.each(scripts)('card script $id', (script) => {
  it('has a loop of 3.5 to 6.5 s and a still inside it', () => {
    expect(script.loopMs).toBeGreaterThanOrEqual(3500);
    expect(script.loopMs).toBeLessThanOrEqual(6500);
    expect(script.stillMs).toBeGreaterThanOrEqual(0);
    expect(script.stillMs).toBeLessThan(script.loopMs);
  });

  it('creates, draws across the loop and the still, and destroys cleanly', () => {
    const fake = createFakeScene();
    const rig = script.create(fake.scene);
    expect(fake.objects.length).toBeGreaterThan(0);
    for (let t = 0; t < script.loopMs; t += 50) rig.draw(t);
    rig.draw(script.loopMs - 1);
    rig.draw(script.stillMs);
    expect(() => assertClean(fake)).toThrow();
    rig.destroy();
    assertClean(fake);
  });
});

describe('card 4 shrink', () => {
  it('never grows and ends smaller than it starts', () => {
    let prev = Infinity;
    for (let t = 0; t < card4Script.loopMs; t += 25) {
      const r = shrinkRadius(t);
      expect(r).toBeLessThanOrEqual(prev + 1e-9);
      prev = r;
    }
    expect(shrinkRadius(0)).toBeGreaterThan(shrinkRadius(card4Script.loopMs - 1));
  });

  it('is already shrinking at the still', () => {
    expect(shrinkRadius(card4Script.stillMs)).toBeLessThan(shrinkRadius(0));
  });
});

describe('card 5 scoring', () => {
  it('shows +1, then +3, then nothing', () => {
    expect(scoreLabelAt(0)).toBeNull();
    expect(scoreLabelAt(1600)).toBe('+1');
    expect(scoreLabelAt(3400)).toBe('+3');
    expect(scoreLabelAt(card5Script.loopMs - 1)).toBeNull();
    expect(scoreLabelAt(card5Script.stillMs)).toBe('+3');
  });
});

describe('card 6 ghost', () => {
  it('ticks 4, 3, 2, 1 then stops', () => {
    expect(countdownAt(0)).toBeNull();
    expect(countdownAt(700)).toBe(4);
    expect(countdownAt(1400)).toBe(3);
    expect(countdownAt(2000)).toBe(2);
    expect(countdownAt(2600)).toBe(1);
    expect(countdownAt(3200)).toBeNull();
    expect(countdownAt(card6Script.stillMs)).toBeNull();
  });
});
