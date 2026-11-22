// The build views (SPEC §7.5, §15.2; RD5): the life-cycle state picker, the amber HP bar rule, the
// frame-cost rule for a steady build and the view registry found by glob.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { shieldGen } from '../../../content/balance';
import { buildBarShown, buildPhase, hpBarShown, hpFraction } from '../../render/buildLook';
import { BUILD_FRAMES, SHIELD_BASE, SHIELD_SHIMMER } from '../../render/keys';
import type { BuildViewState } from '../../render/types';
import { BUILD_VIEWS } from '../buildsView';
import { fakeRender } from './fakeRender';

describe('build life-cycle state picker', () => {
  const b = (state: 'flight' | 'landed' | 'active', hp: number) => ({ state, hp, maxHp: 300 });

  it('thrown while in flight, landed until it switches on, then active', () => {
    expect(buildPhase(b('flight', 300))).toBe('flight');
    expect(buildPhase(b('landed', 300))).toBe('landed');
    expect(buildPhase(b('active', 300))).toBe('active');
  });

  it('HP 49% is damaged; 50% is still active', () => {
    expect(buildPhase({ state: 'active', hp: 147, maxHp: 300 })).toBe('damaged');
    expect(buildPhase({ state: 'active', hp: 150, maxHp: 300 })).toBe('active');
    expect(buildPhase({ state: 'landed', hp: 0.49 * 300, maxHp: 300 })).toBe('damaged');
  });

  it('destroyed shows the wreck; a thrown build in the air stays in flight whatever its HP', () => {
    expect(buildPhase({ ...b('active', 0), destroyed: true })).toBe('destroyed');
    expect(buildPhase(b('flight', 10))).toBe('flight');
  });

  it('a build with no HP (mines, the flag) is never damaged', () => {
    expect(buildPhase({ state: 'active', hp: 0, maxHp: 0 })).toBe('active');
    expect(hpFraction(0, 0)).toBe(1);
  });
});

describe('HP bars', () => {
  it('are hidden at full HP and shown once damaged', () => {
    expect(hpBarShown(300, 300)).toBe(false);
    expect(hpBarShown(299, 300)).toBe(true);
    expect(hpBarShown(0, 300)).toBe(false);
    expect(buildBarShown('active', 1)).toBe(false);
    expect(buildBarShown('active', 0.8)).toBe(true);
    expect(buildBarShown('damaged', 0.3)).toBe(true);
  });

  it('a build shows none in the air or as a wreck', () => {
    expect(buildBarShown('flight', 0.5)).toBe(false);
    expect(buildBarShown('destroyed', 0)).toBe(false);
  });
});

describe('the view registry', () => {
  it('finds the shield generator view by its BuildId', () => {
    expect(BUILD_VIEWS.get('shield_gen')?.id).toBe('shield_gen');
  });
});

const state = (over: Partial<BuildViewState> = {}): BuildViewState => ({
  phase: 'active',
  x: 12,
  y: 10,
  sx: 672,
  sy: 456,
  z: 0,
  flightU: 1,
  hpFrac: 1,
  radius: shieldGen.radius,
  clockMs: 0,
  ...over,
});

describe('shield generator view: frame cost (SPEC §15.2)', () => {
  const PER_FRAME = new Set(['setPosition', 'setScale', 'setAlpha', 'setDepth', 'setDisplaySize']);

  it('makes everything up front and never rebuilds a texture or graphic per frame', () => {
    const fake = fakeRender();
    const v = BUILD_VIEWS.get('shield_gen')!.create(fake.ctx);
    const s = state();
    v.update(s, 16);
    const made = { ...fake.made };
    fake.mark();
    for (let i = 0; i < 300; i++) {
      s.clockMs += 16;
      v.update(s, 16);
    }
    expect(fake.made).toEqual(made);
    // Only position, alpha and scale move on a steady build (no frame swap, no visibility toggles).
    for (const call of fake.since().keys()) expect(PER_FRAME.has(call), call).toBe(true);
  });

  it('swaps its frame once per state change, never in between', () => {
    const fake = fakeRender();
    const v = BUILD_VIEWS.get('shield_gen')!.create(fake.ctx);
    const s = state({ phase: 'flight', z: 1.2, flightU: 0.4 });
    v.update(s, 16);
    const base = fake.made.frames;
    for (let i = 0; i < 60; i++) v.update({ ...s, flightU: 0.4 + i / 200 }, 16);
    expect(fake.made.frames).toBe(base);
    v.update(state({ phase: 'landed' }), 16);
    expect(fake.made.frames).toBe(base + 1);
    for (let i = 0; i < 60; i++) v.update(state({ phase: 'landed' }), 16);
    expect(fake.made.frames).toBe(base + 1);
    v.update(state({ phase: 'damaged', hpFrac: 0.4 }), 16);
    expect(fake.made.frames).toBe(base + 2);
  });

  it('a damaged build shows its bar by moving and scaling it, not drawing', () => {
    const fake = fakeRender();
    const v = BUILD_VIEWS.get('shield_gen')!.create(fake.ctx);
    const s = state({ phase: 'damaged', hpFrac: 0.4 });
    v.update(s, 16);
    const made = { ...fake.made };
    fake.mark();
    for (let i = 0; i < 120; i++) {
      s.hpFrac = 0.4 - i / 1000;
      s.clockMs += 16;
      v.update(s, 16);
    }
    expect(fake.made).toEqual(made);
    expect(fake.since().get('setDisplaySize')).toBeGreaterThan(0);
    for (const call of fake.since().keys()) expect(PER_FRAME.has(call), call).toBe(true);
  });

  it('names the shield frames through the typed keys', () => {
    expect(SHIELD_SHIMMER).toHaveLength(3);
    expect(SHIELD_BASE).toBe('shield-base');
    expect(BUILD_FRAMES.shield_gen.destroyed).toBe('shield-gen/destroyed');
    expect(content.builds.find((d) => d.id === 'shield_gen')).toBeDefined();
  });
});
