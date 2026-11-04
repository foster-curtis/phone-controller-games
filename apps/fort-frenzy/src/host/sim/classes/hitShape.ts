// An attack's hit area (SPEC §8, §10.1, §15.2): one source of truth for the sim's arc and cone tests
// and the TV's aim previews (C3), from the attack's def through the player's effective stats, so
// tuning and cards move the preview with the hit. Leaf module: types only.
import type { AttackDef, StatId } from '../../../content/types';

/** `base` through the attacker's mods for `stat`, scoped to the attack's button. */
export type AttackStatFn = (base: number, stat: StatId) => number;

export type HitShape =
  /** One projectile: a strip `range` long along the aim. */
  | { kind: 'line'; range: number }
  /** Arcs, cones and spread volleys: a sector from the attacker, `half` the opening (radians). */
  | { kind: 'cone'; range: number; half: number }
  /** A circle of `radius` around the attacker. */
  | { kind: 'circle'; radius: number }
  /** Hits nothing (the Commander's morale). */
  | { kind: 'none' };

const RAD = Math.PI / 180;

export function hitShape(a: AttackDef, stat: AttackStatFn): HitShape {
  switch (a.shape) {
    case 'projectile': {
      const range = stat(a.range, 'range');
      // A volley's bolts fan out evenly over `spreadDeg` (players.ts `fire`).
      const spread = a.spreadDeg ?? 0;
      if ((a.count ?? 1) > 1 && spread > 0)
        return { kind: 'cone', range, half: (spread / 2) * RAD };
      return { kind: 'line', range };
    }
    case 'arc':
    case 'cone':
      return { kind: 'cone', ...sectorGeometry(a, stat) };
    case 'circle':
      return { kind: 'circle', radius: stat(a.radius ?? a.range, 'radius') };
    case 'buff':
      return { kind: 'none' };
  }
}

/** The sector of an `arc` or `cone` attack: its reach and half the opening (radians). */
export function sectorGeometry(a: AttackDef, stat: AttackStatFn): { range: number; half: number } {
  return { range: stat(a.range, 'range'), half: (stat(a.arcDeg ?? 90, 'arcDeg') / 2) * RAD };
}
