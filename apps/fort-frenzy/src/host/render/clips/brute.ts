// Brute clips (SPEC §9.6): a heavy stomp (C1 note 3). Each leg slides back while planted, lifts
// high, swings forward and slams down; the torso drops hard on every footfall and the fists swing
// against the step. The legs translate rather than turn, so the box feet stay flat. The wall-hit
// tell arrives with FF10.
import rig from '../../../../art/neon-knights/rigs/brute.json';
import type { Clip, RigDef } from '../../../themes/types';
import {
  each,
  enemyDeath,
  enemyHit,
  idleBob,
  loop,
  sin,
  stompBody,
  stompLeg,
  wave,
} from '../clipKit';

const MS = 1100;

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
};
