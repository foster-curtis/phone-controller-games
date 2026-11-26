// Clip sampling, rig composition, facing → view and the camera projection (SPEC §12.2).
import { describe, expect, it } from 'vitest';
import { RIGS } from '../assets';
import { FixedCamera } from '../camera';
import { blendSamples, REST, sampleClip } from '../clip';
import { apply, composePose, viewForFacing } from '../rigMath';
import type { Clip } from '../types';

describe('clips', () => {
  const clip: Clip = {
    durationMs: 100,
    loop: true,
    tracks: {
      a: [
        { t: 0, rot: 0 },
        { t: 100, rot: 10 },
      ],
    },
  };

  it('interpolates, wraps loops and clamps one-shots', () => {
    expect(sampleClip(clip, 50).get('a')!.rot).toBeCloseTo(5);
    expect(sampleClip(clip, 150).get('a')!.rot).toBeCloseTo(5);
    expect(sampleClip({ ...clip, loop: false }, 500).get('a')!.rot).toBeCloseTo(10);
  });

  it('blends toward REST for parts one side lacks', () => {
    const a = sampleClip(clip, 50);
    expect(blendSamples(a, new Map(), 0.5).get('a')!.rot).toBeCloseTo(2.5);
    expect(blendSamples(a, new Map(), 0).get('a')).toEqual(a.get('a'));
    expect(REST.sx).toBe(1);
  });
});

describe('rig math', () => {
  it('composes the rest pose to identity, and children follow their parent', () => {
    const pose = RIGS.citizen.views.front.poses.base!;
    const rest = composePose(pose, new Map());
    expect(apply(rest.get('hair')!, 20, 10)).toEqual([20, 10]);
    const moved = composePose(pose, new Map([['tunic', { ...REST, dy: 2 }]]));
    const [x, y] = apply(moved.get('hair')!, 20, 10);
    expect(x).toBeCloseTo(20);
    expect(y).toBeCloseTo(12);
  });

  it('picks back up-screen, front down-screen and a mirrored side for left', () => {
    expect(viewForFacing(-Math.PI / 2)).toEqual({ view: 'back', mirror: false });
    expect(viewForFacing(Math.PI / 2)).toEqual({ view: 'front', mirror: false });
    expect(viewForFacing(0)).toEqual({ view: 'side', mirror: false });
    expect(viewForFacing(Math.PI)).toEqual({ view: 'side', mirror: true });
  });
});

describe('camera', () => {
  it('projects tiles at 48 px wide and 28.8 px deep, height up 48 px per tile', () => {
    const cam = new FixedCamera();
    expect(cam.toScreen({ x: 40, y: 37.5 })).toEqual({ x: 1920, y: 1080 });
    expect(cam.toScreen({ x: 1, y: 1 }, 1).y).toBeCloseTo(28.8 - 48);
    const w = cam.toWorld({ x: 960, y: 540 });
    expect(w.x).toBeCloseTo(20);
    expect(w.y).toBeCloseTo(18.75);
    expect(cam.depth({ x: 0, y: 10 })).toBeCloseTo(288);
  });
});
