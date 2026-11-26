// The healing beacon on the TV (SPEC §7.5, §15.2; RD8): the life cycle plus one `beacon-pulse` ring,
// started by the sim's pulse and only moved, scaled and faded (the frame-cost rule).
import { describe, expect, it } from 'vitest';
import { beacon } from '../../../content/balance';
import { BEACON_PULSE, BUILD_FRAMES } from '../../render/keys';
import type { BuildViewState } from '../../render/types';
import { pulseLook, PULSE_MS } from '../builds/beacon';
import { BUILD_VIEWS } from '../buildsView';
import { fakeRender } from './fakeRender';

const state = (over: Partial<BuildViewState> = {}): BuildViewState => ({
  phase: 'active',
  x: 12,
  y: 10,
  sx: 672,
  sy: 456,
  z: 0,
  flightU: 1,
  hpFrac: 1,
  radius: beacon.radius,
  clockMs: 0,
  nextPulse: 100,
  ...over,
});

const PER_FRAME = new Set([
  'setPosition',
  'setScale',
  'setAlpha',
  'setDepth',
  'setDisplaySize',
  'lib.setUnitScale',
]);

describe('beacon view', () => {
  it('is found by its BuildId and names its frames through the typed keys', () => {
    expect(BUILD_VIEWS.get('beacon')?.id).toBe('beacon');
    expect(BUILD_FRAMES.beacon.active).toBe('beacon/active');
    expect(BEACON_PULSE).toBe('beacon-pulse');
  });

  it('the ring grows to the radius and fades out', () => {
    expect(pulseLook(0).scale).toBeLessThan(0.5);
    expect(pulseLook(0).alpha).toBeGreaterThan(0.5);
    expect(pulseLook(1).scale).toBe(1);
    expect(pulseLook(1).alpha).toBe(0);
  });

  it('pulses without making anything, per the frame-cost rule', () => {
    const fake = fakeRender();
    const v = BUILD_VIEWS.get('beacon')!.create(fake.ctx);
    const s = state();
    v.update(s, 16);
    const made = { ...fake.made };
    fake.mark();
    for (let i = 0; i < 300; i++) {
      s.clockMs += 16;
      if (i % 60 === 0) s.nextPulse = 100 + i;
      v.update(s, 16);
    }
    expect(fake.made).toEqual(made);
    for (const call of fake.since().keys()) expect(PER_FRAME.has(call), call).toBe(true);
  });

  it('draws nothing extra between pulses', () => {
    const fake = fakeRender();
    const v = BUILD_VIEWS.get('beacon')!.create(fake.ctx);
    const s = state();
    v.update(s, 16);
    s.nextPulse = 160;
    v.update(s, 16);
    for (let t = 0; t <= PULSE_MS + 32; t += 16) v.update(s, 16);
    fake.mark();
    v.update(s, 16);
    // Settled: the ring no longer scales.
    expect(fake.since().get('lib.setUnitScale') ?? 0).toBe(0);
  });
});
