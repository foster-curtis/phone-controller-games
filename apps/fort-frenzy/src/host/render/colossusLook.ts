// The Colossus's looks that clips can't carry (SPEC §9.6; FF11), shared by the run's view
// (scene/colossusView.ts) and the gallery: its tier groups, the clip each boss attack plays, head
// tracking toward its aim, and the core glow that shows the hidden stagger meter (brighter and
// faster as it fills, a white-violet flare while staggered, larger once the final phase opens the
// chest). Enemy parts aren't emissive (BUILD_PLAN §8 FF10), so the glows are drawn at the rig's
// attach points on the effects layer, where the bloom takes the violet. Pure except `drawCore`.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { HEAD_TURN } from './clips/colossus';
import { colossusGroups } from './gallery/state';

/** Optional groups for a Mk (1–3) and the final phase, cumulative (art README). */
export function colossusGroupsFor(mk: 1 | 2 | 3, final: boolean): string[] {
  return colossusGroups(final ? 4 : mk);
}

/** Every optional group of the rig, to switch the rest off. */
export const COLOSSUS_GROUPS = ['mk2', 'mk3', 'final'] as const;

/** The clip a boss attack (`BossAct.kind`) plays; the wall breaker is the slam's motion. */
export const CLIP_OF_ACT: Readonly<Record<string, string>> = {
  slam: 'slam',
  breaker: 'slam',
  boulder: 'throw',
  call: 'call',
};

/** Clips the Colossus owns while they play: hits flash it but don't replace them. */
export const COLOSSUS_ONE_SHOTS = new Set(['slam', 'throw', 'call', 'stagger']);

/** Spire attach points per Mk (spires 1, 2 and 4 arrive at Mk II, 3 and 5 at Mk III). */
export function spiresFor(mk: 1 | 2 | 3): string[] {
  if (mk === 1) return [];
  return mk === 2
    ? ['spire-1', 'spire-2', 'spire-4']
    : ['spire-1', 'spire-2', 'spire-3', 'spire-4', 'spire-5'];
}

/**
 * Head offset toward a world-ground angle (§9.6 head tracking): it turns toward the side it's
 * walking or aiming at (up or down the screen in the side view), sliding a little that way.
 */
export function headTarget(angle: number): { rot: number; dy: number } {
  const lateral = Math.sin(angle);
  return { rot: HEAD_TURN.rot * lateral, dy: HEAD_TURN.dy * lateral };
}

/** Eases the head toward its target; `snap` (before a slam or throw) turns it almost at once. */
export function easeHead(
  head: { rot: number; dy: number },
  target: { rot: number; dy: number },
  dtMs: number,
  snap: boolean,
): void {
  const k = Math.min(1, dtMs / (snap ? 45 : 380));
  head.rot += (target.rot - head.rot) * k;
  head.dy += (target.dy - head.dy) * k;
}

/** Core throb rate (Hz) for a stagger meter 0..1: slow when empty, fast when nearly full. */
export function coreHz(stagger: number): number {
  const m = Math.min(1, Math.max(0, stagger));
  return 0.5 + 3.5 * m * m;
}

export interface CoreLook {
  /** Glow radius, sprite units. */
  r: number;
  /** 0..1+ (above 1 brightens the halo). */
  level: number;
  /** The white-violet flare of the bonus-damage window. */
  flare: boolean;
}

/**
 * The core for a meter, the stagger window and the final phase at throb `phase` (cycles): the base
 * brightness rises with the meter and the beat rides on top of it.
 */
export function coreLook(
  stagger: number,
  staggered: boolean,
  final: boolean,
  phase: number,
): CoreLook {
  const r = final ? 15 : 10;
  if (staggered) {
    const f = phase - Math.floor(phase);
    return { r: r * 1.5, level: 1.4 + 0.3 * Math.sin(f * Math.PI * 2), flare: true };
  }
  const m = Math.min(1, Math.max(0, stagger));
  const f = phase - Math.floor(phase);
  const beat = Math.pow(1 - f, 3);
  return { r, level: 0.3 + 0.55 * m + (0.15 + 0.35 * m) * beat, flare: false };
}

/** Draws the core glow at a screen point (`unitPx` px per sprite unit). */
export function drawCore(
  g: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  unitPx: number,
  look: CoreLook,
): void {
  const rPx = look.r * unitPx;
  const a = Math.min(1, look.level);
  g.fillStyle(theme.color.hostile.num, 0.24 * a);
  g.fillCircle(sx, sy, rPx * (1 + 0.6 * look.level));
  g.fillStyle(theme.color.hostileCore.num, 0.85 * a);
  g.fillCircle(sx, sy, rPx * 0.5 * (0.6 + 0.4 * a));
  if (look.flare) {
    g.fillStyle(theme.color.foreground.num, 0.75);
    g.fillCircle(sx, sy, rPx * 0.32);
  }
}
