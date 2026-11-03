// Skitter (Runner) clips (SPEC §9.6): a fast low scuttle; the core pulses slowly (C1 note 3: one
// pulse per four strides), and faster near the base (code raises the playback speed).
import rig from '../../../../art/neon-knights/rigs/skitter.json';
import type { Clip, Keyframe, RigDef } from '../../../themes/types';
import { cos, each, enemyDeath, enemyHit, loop, sin, wave } from '../clipKit';

const pulse = (ms: number): Keyframe[] =>
  wave(ms, 16, (u) => ({ sx: 1 + 0.08 * sin(u), sy: 1 + 0.08 * sin(u) }));

const STRIDE = 340;
const STRIDES = 4;
const WALK = STRIDE * STRIDES;

/** A leg pair's swing over four strides, lifting on the forward swing. */
const leg = (sign: 1 | -1) =>
  wave(WALK, 64, (u0) => {
    const u = u0 * STRIDES;
    const l = Math.max(0, -sign * cos(u));
    return { rot: sign * 22 * sin(u) - 4 * l, sy: 1 - 0.14 * l };
  });

export const clips: Record<string, Clip> = {
  idle: loop(1800, { core: pulse(1800) }),
  walk: loop(
    WALK,
    { body: wave(WALK, 64, (u) => ({ dy: 1.2 * (Math.abs(sin(u * STRIDES)) - 0.4) })) },
    each(['leg-far-a', 'leg-near-b'], leg(1)),
    each(['leg-far-b', 'leg-near-a'], leg(-1)),
    { core: pulse(WALK) },
  ),
  hit: enemyHit(['body'], 8, 3),
  death: enemyDeath(rig as unknown as RigDef),
};
