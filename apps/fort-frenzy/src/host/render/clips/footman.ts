// Automaton footman clips (SPEC §2.4): idle, march, a short stab, thrown and the collapse into scrap. The side
// view has no free hand (art note, BUILD_PLAN §8), so only the blade hand swings. The collapse is
// solved per view (`death@<view>`) and fades; wiring drops `scrap-ours` 1–2 when it lands (FF9).
import rig from '../../../../art/neon-knights/rigs/footman.json';
import type { Clip, RigDef } from '../../../presentation/types';
import {
  each,
  ENEMY_DEATH,
  idleBob,
  loop,
  once,
  perViewClips,
  sin,
  walkerWalk,
  wave,
} from '../clipKit';
import { collapseTracks, landedAt } from '../fall';

const def = rig as unknown as RigDef;

/** Stab: the blade hand thrusts forward and back. */
export const STAB_MS = 300;
const attack: Clip = once(STAB_MS, {
  hand: [
    { t: 0, dx: 0, rot: 0 },
    { t: 90, dx: 7, rot: -6 },
    { t: STAB_MS, dx: 0, rot: 0 },
  ],
  torso: [
    { t: 0, dx: 0 },
    { t: 90, dx: 1.5 },
    { t: STAB_MS, dx: 0 },
  ],
});

/** Collapse: the parts fall into a pile, lie still, then fade (the enemies' timing, quicker). */
const COLLAPSE = { ...ENEMY_DEATH, hold: 500, fadeMs: 500, seed: 'footman' };
const fadeAt = Math.round(landedAt(COLLAPSE) + COLLAPSE.stagger * 0.5 + COLLAPSE.hold);
const end = fadeAt + COLLAPSE.fadeMs;

/** Thrown by Reinforcements: tucked, the body rocking while it arcs (the arc is code, §2.4). */
const THROWN_MS = 360;
const thrown: Clip = loop(
  THROWN_MS,
  each(
    ['torso', 'helm', 'plume'],
    wave(THROWN_MS, 8, (u) => ({ rot: 16 * sin(u), dy: 5 })),
  ),
  each(['leg-far', 'leg-near', 'leg-l', 'leg-r'], [{ t: 0, dy: -6, sy: 0.72 }]),
  each(['hand', 'hand-free'], [{ t: 0, dy: 4, rot: 24 }]),
);

export const clips: Record<string, Clip> = {
  idle: idleBob(1500, ['torso'], 0.8),
  walk: walkerWalk(
    480,
    ['torso'],
    ['leg-far', 'leg-l'],
    ['leg-near', 'leg-r'],
    18,
    1.5,
    each(
      ['hand', 'hand-free'],
      wave(480, 8, (u) => ({ rot: 8 * sin(u) })),
    ),
  ),
  attack,
  thrown,
  ...perViewClips(def, 'death', (view) =>
    once(end, collapseTracks(def, { ...COLLAPSE, fade: [fadeAt, end] }, view)),
  ),
};
