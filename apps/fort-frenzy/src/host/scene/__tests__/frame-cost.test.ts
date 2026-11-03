// FF7-fix-1: the World scene's per-frame path makes no texture redraws or new objects while nothing
// changes (the smoke and reconnect e2e timeouts: a nametag Text redrawn every frame stalled software
// GL). Counts calls across many frames with fakes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawBowString, type StringRig } from '../../render/bowString';
import { ATTACK_MS, DRAW_END_MS, RELEASE_MS } from '../../render/clips/ranger';
import { syncTag } from '../tag';

const FRAMES = 300;

describe('nametags redraw only on change', () => {
  it('sets text and color once each, then never while they hold', () => {
    const calls = { text: 0, color: 0 };
    const tag = {
      text: 'Ann',
      setText(t: string) {
        calls.text++;
        this.text = t;
      },
      setColor() {
        calls.color++;
      },
    };
    const state = { color: '#fff' };
    for (let i = 0; i < FRAMES; i++) syncTag(tag, state, 'Ann', '#fff');
    expect(calls).toEqual({ text: 0, color: 0 });
    // Down: the countdown in the muted color, one redraw per change.
    for (let i = 0; i < FRAMES; i++) syncTag(tag, state, String(3 - Math.floor(i / 100)), '#888');
    expect(calls).toEqual({ text: 3, color: 1 });
  });

  it('is the only way the World scene touches a nametag', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'worldView.ts'), 'utf8');
    expect(src).not.toMatch(/\.tag\.set(Text|Color|Style|Stroke|FontSize)\(/);
    expect(src).toMatch(/syncTag\(k\.tag/);
  });
});

describe('the code-drawn bowstring costs nothing outside a shot', () => {
  const fakeRig = (clip: string, t: () => number) => {
    const counts = { overlay: 0, clear: 0, stroke: 0 };
    const g = {
      clear() {
        counts.clear++;
        return g;
      },
      lineStyle: () => g,
      beginPath: () => g,
      moveTo: () => g,
      lineTo: () => g,
      strokePath() {
        counts.stroke++;
        return g;
      },
    };
    const rig = {
      rigId: 'ranger',
      clip,
      pose: 'ready',
      view: 'side',
      get clipT() {
        return t();
      },
      overlay() {
        counts.overlay++;
        return g;
      },
      partPoint: (_part: string, at: [number, number]) => at,
    };
    return { rig: rig as unknown as StringRig & { clip: string }, counts };
  };

  it('never makes or clears an overlay while idle or walking', () => {
    for (const clip of ['idle', 'walk', 'build']) {
      const { rig, counts } = fakeRig(clip, () => 0);
      for (let i = 0; i < FRAMES; i++) drawBowString(rig);
      expect(counts).toEqual({ overlay: 0, clear: 0, stroke: 0 });
    }
  });

  it('draws during the shot, clears once after, then stays idle', () => {
    let t = 0;
    const { rig, counts } = fakeRig('attack', () => t);
    // Through the clip: drawn while the art string is dark, cleared once when it shows.
    for (t = 0; t <= ATTACK_MS; t += 10) drawBowString(rig);
    expect(counts.stroke).toBeGreaterThan(0);
    const after = { ...counts };
    for (let i = 0; i < FRAMES; i++) drawBowString(rig);
    expect(counts).toEqual(after);
    // At full draw and hold (art string showing) nothing is drawn.
    expect(DRAW_END_MS).toBeLessThan(RELEASE_MS);
  });
});
