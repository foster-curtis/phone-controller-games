// Brute clips (SPEC §9.6): a heavy stomp (C1 note 3). Each leg slides back while planted, lifts
// high, swings forward and slams down; the torso drops hard on every footfall and the fists swing
// against the step. The legs translate rather than turn, so the box feet stay flat. Attack (FF10):
// the tell is the ram fist rearing back with the torso leaning away while the furnace flares (code
// draws the flare, scene/enemyFx.ts), then the fist rams forward on the content wind-up's end.
import rig from '../../../../art/neon-knights/rigs/brute.json';
import type { Clip, RigDef } from '../../../themes/types';
import {
  each,
  enemyDeath,
  enemyHit,
  idleBob,
  loop,
  once,
  sin,
  stompBody,
  stompLeg,
  wave,
} from '../clipKit';

const MS = 1100;

/** The Brute's wind-up is 700 ms (content); the fist lands then. */
export const BRUTE_STRIKE_MS = 700;

const attack: Clip = once(
  1150,
  {
    torso: [
      { t: 0, rot: 0, dx: 0, dy: 0 },
      { t: 520, rot: -5, dx: -3, dy: 0 },
      { t: BRUTE_STRIKE_MS, rot: 9, dx: 6, dy: 2 },
      { t: 860, rot: 6, dx: 4, dy: 1 },
      { t: 1150, rot: 0, dx: 0, dy: 0 },
    ],
    'arm-near': [
      { t: 0, rot: 0 },
      { t: 520, rot: 38 },
      { t: 640, rot: 42 },
      { t: BRUTE_STRIKE_MS, rot: -48 },
      { t: 860, rot: -40 },
      { t: 1150, rot: 0 },
    ],
    'arm-far': [
      { t: 0, rot: 0 },
      { t: 520, rot: -8 },
      { t: BRUTE_STRIKE_MS, rot: 10 },
      { t: 1150, rot: 0 },
    ],
    head: [
      { t: 0, dy: 0 },
      { t: BRUTE_STRIKE_MS, dy: 1.5 },
      { t: 1150, dy: 0 },
    ],
  },
  {
    'leg-near': [
      { t: 0, dx: 0 },
      { t: BRUTE_STRIKE_MS, dx: 3 },
      { t: 1150, dx: 0 },
    ],
  },
);

export const clips: Record<string, Clip> = {
  idle: idleBob(2000, ['torso'], 1.5),
  walk: loop(
    MS,
    // Footfalls at u = 0 (near) and 0.5 (far): the swing ends at u = 1 of each leg's cycle.
    { 'leg-near': stompLeg(MS, 0, { stride: 5, lift: 9 }) },
    { 'leg-far': stompLeg(MS, 0.5, { stride: 5, lift: 9 }) },
    { torso: stompBody(MS, 2, 6) },
    each(
      ['arm-near', 'arm-far'],
      wave(MS, 16, (u) => ({ rot: 5 * sin(u, 0.5) })),
    ),
    { head: wave(MS, 16, (u) => ({ dy: 1.2 * Math.abs(sin(u)) })) },
  ),
  hit: enemyHit(['torso'], 4, 2.5, 300),
  death: enemyDeath(rig as unknown as RigDef, { fall: 460, stagger: 180 }),
  attack,
};
