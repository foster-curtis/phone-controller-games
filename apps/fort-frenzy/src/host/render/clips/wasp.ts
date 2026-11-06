// Wasp drone (Flyer) clips (SPEC §9.6): no legs. It bobs at a fixed height (never toward the
// ground); the rotor discs flicker to read as spinning. On death it drops from its hover height
// (WASP_HOVER_TILES, the gallery's and the world's) and breaks apart on the ground.
// Attack (FF10): it tips its stinger toward the target while the muzzle charges (code draws the
// charge), fires on the content wind-up's end with a small kick back, and levels out.
import rig from '../../../../art/neon-knights/rigs/wasp.json';
import type { Clip, RigDef } from '../../../themes/types';
import { each, enemyDeath, enemyHit, loop, once, sin, wave } from '../clipKit';

/**
 * The art's own lift, tiles (a tile is 80 sprite units of height, SPEC §2.5): the hull's underside
 * (`body` part, y 30) sits 91 units over the rig's foot (y 121).
 */
export const WASP_ART_LIFT_TILES = 91 / 80;
/**
 * Flight height in tiles: the hull's underside over its shadow, the gap the room reads (§2.5
 * height). C4 (Foster): half of FF10's (the art's lift + a 1.6-tile hover = 2.74). The content
 * body hitbox's `bottom` is this value (body.test.ts).
 */
export const WASP_FLIGHT_TILES = (WASP_ART_LIFT_TILES + 1.6) / 2;
/** The hover the renderer adds over the art's lift, tiles. */
export const WASP_HOVER_TILES = WASP_FLIGHT_TILES - WASP_ART_LIFT_TILES;
/** The Flyer's wind-up is 300 ms (content); the shot leaves the stinger then. */
export const WASP_FIRE_MS = 300;

const rotors = (ms: number) =>
  each(
    ['rotor-near', 'rotor-far'],
    wave(ms, 4, (u) => ({ sx: 1 - 0.18 * Math.abs(sin(u * 4)) })),
  );

const attack: Clip = once(
  620,
  {
    body: [
      { t: 0, rot: 0, dx: 0, dy: 0 },
      { t: 220, rot: 9, dx: 1, dy: 1 },
      { t: WASP_FIRE_MS, rot: 10, dx: 1, dy: 1 },
      { t: WASP_FIRE_MS + 40, rot: 4, dx: -3, dy: 0 },
      { t: 620, rot: 0, dx: 0, dy: 0 },
    ],
    head: [
      { t: 0, rot: 0 },
      { t: 220, rot: 6 },
      { t: WASP_FIRE_MS + 40, rot: -2 },
      { t: 620, rot: 0 },
    ],
  },
  rotors(620),
);

export const clips: Record<string, Clip> = {
  idle: loop(1200, { body: wave(1200, 8, (u) => ({ dy: 2 * sin(u) })) }, rotors(1200)),
  walk: loop(
    900,
    { body: wave(900, 8, (u) => ({ dy: 2 * sin(u), rot: 4 + 1.5 * sin(u) })) },
    rotors(900),
  ),
  hit: enemyHit(['body'], 10, 4),
  death: enemyDeath(rig as unknown as RigDef, {
    fall: 520,
    stagger: 80,
    drop: WASP_HOVER_TILES * 80,
  }),
  attack,
};
