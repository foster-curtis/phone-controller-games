// The mine on the TV (SPEC §7.4, §7.5; RD7): `armed` at full opacity while arming, 40% once live,
// `trigger` at full opacity for the delay; a frame swap only on a state change.
import { describe, expect, it } from 'vitest';
import { mine } from '../../../content/balance';
import { BUILD_FRAMES, MARK_FRAMES, MINE_TRIGGER } from '../../render/keys';
import type { BuildViewState } from '../../render/types';
import { BUILD_VIEWS } from '../buildsView';
import { MINE_LIVE_ALPHA } from '../builds/mine';
import { fakeRender } from './fakeRender';

const state = (over: Partial<BuildViewState> = {}): BuildViewState => ({
  phase: 'landed',
  x: 12,
  y: 10,
  sx: 672,
  sy: 456,
  z: 0,
  flightU: 1,
  hpFrac: 1,
  radius: mine.radius,
  clockMs: 0,
  ...over,
});

/** The view with the alphas its body is given, last one first. */
function setup() {
  const fake = fakeRender();
  const alphas: number[] = [];
  const frames: string[] = [];
  const lib = fake.ctx.lib as unknown as {
    image: (n: string) => { img: Record<string, unknown>; name: string };
    setFrame: (a: { name: string }, n: string) => void;
  };
  const image = lib.image;
  lib.image = (n) => {
    const a = image(n);
    const img = a.img;
    a.img = new Proxy(img, {
      get(t, k: string) {
        if (k === 'setAlpha')
          return (v: number) => {
            alphas.unshift(v);
            return a.img;
          };
        return t[k];
      },
    });
    return a;
  };
  const setFrame = lib.setFrame;
  lib.setFrame = (a, n) => {
    frames.push(n);
    setFrame(a, n);
  };
  const view = BUILD_VIEWS.get('mine')!.create(fake.ctx);
  return { fake, view, alphas, frames };
}

describe('mine view', () => {
  it('is found by its BuildId', () => {
    expect(BUILD_VIEWS.get('mine')?.id).toBe('mine');
  });

  it('shows armed at full opacity while arming, then 40% once live', () => {
    const { view, alphas, frames } = setup();
    view.update(state(), 16);
    expect(frames).toEqual([BUILD_FRAMES.mine.landed]);
    expect(alphas[0]).toBe(1);
    view.update(state({ phase: 'active' }), 16);
    expect(frames[frames.length - 1]).toBe(BUILD_FRAMES.mine.active);
    expect(alphas[0]).toBe(MINE_LIVE_ALPHA);
    expect(MINE_LIVE_ALPHA).toBe(0.4);
  });

  it('shows trigger at full opacity for the delay, and armed at 40% if it re-arms', () => {
    const { view, alphas, frames } = setup();
    view.update(state({ phase: 'active' }), 16);
    view.update(state({ phase: 'active', triggered: true }), 16);
    expect(frames[frames.length - 1]).toBe(MINE_TRIGGER);
    expect(alphas[0]).toBe(1);
    view.update(state({ phase: 'active' }), 16);
    expect(frames[frames.length - 1]).toBe(BUILD_FRAMES.mine.active);
    expect(alphas[0]).toBe(MINE_LIVE_ALPHA);
  });

  it('swaps its frame only when its state changes', () => {
    const { view, frames } = setup();
    for (let i = 0; i < 30; i++) view.update(state({ phase: 'active' }), 16);
    const after = frames.length;
    for (let i = 0; i < 30; i++) view.update(state({ phase: 'active', clockMs: i * 16 }), 16);
    expect(frames).toHaveLength(after);
    for (let i = 0; i < 30; i++) view.update(state({ phase: 'active', triggered: true }), 16);
    expect(frames).toHaveLength(after + 1);
  });

  it('names the blast frames from the art README', () => {
    expect(MARK_FRAMES['mine-blast-ring']).toBe('mine-blast-ring');
    expect(MARK_FRAMES['mine-blast']).toBe('mine-blast');
    expect(MARK_FRAMES.shockwave).toBe('shockwave');
  });
});
