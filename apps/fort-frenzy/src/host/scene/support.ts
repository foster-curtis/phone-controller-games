// Pure pieces of the support classes' TV drawing (SPEC §2.4; FF9), tested headless: where a knight's
// shots leave from, the morale
// aura's fade and super flash, Lead from the Front's drifting motes, and the Field Medic circle's dots.
import { hash01 } from '../render/fall';
import type { ScreenPoint } from '../render/types';
import { SIM_HZ, STEP_MS, type EntityId, type StatusEffect, type World } from '../sim/types';
import { msToSteps } from '../systems/effects';

/**
 * Immediate-mode drawing that costs nothing while unused (FF7-fix-1's rule: no per-frame GPU work
 * while nothing changes): the graphics object is made on the first draw, and cleared at the next
 * frame's `begin` only if something was drawn since.
 */
export class Scratch<G extends { clear(): unknown; destroy(): void }> {
  private g: G | null = null;
  private dirty = false;

  constructor(private readonly make: () => G) {}

  /** Starts a frame: clears what the last frame drew. */
  begin(): void {
    if (this.dirty) this.g!.clear();
    this.dirty = false;
  }

  /** The graphics to draw on this frame. */
  draw(): G {
    this.g ??= this.make();
    this.dirty = true;
    return this.g;
  }

  destroy(): void {
    this.g?.destroy();
    this.g = null;
  }
}

/** The rig attach point a knight's projectiles leave from (C2: from the weapon, never the feet). */
export function shotAnchor(rigId: string): string {
  return rigId === 'artificer' ? 'lens' : 'bolt';
}

/** The morale aura's alpha: full when cast, fading to nothing as the buff runs out (its timer). */
export function moraleAlpha(remainingMs: number, totalMs: number, peak = 0.32): number {
  if (remainingMs <= 0 || totalMs <= 0) return 0;
  return peak * Math.min(1, remainingMs / totalMs);
}

/** Angles (radians) of the Field Medic circle's dots: `n` evenly spaced, slowly turning. */
export function dottedAngles(n: number, tMs: number, turnHz = 0.05): number[] {
  const off = tMs * 0.001 * turnHz * Math.PI * 2;
  return Array.from({ length: n }, (_, i) => off + (i / n) * Math.PI * 2);
}

/**
 * The super's flash (C3 note): while morale runs, its units' amber parts and the aura under them
 * flash on and off. Timed from the effect's ticks left (sim state, so it can't drift from the buff):
 * on for the first `halfMs` after the cast, off for the next, and so on until the buff ends.
 * `glow` 2 is the cap: a rig's additive boost is full at 2 (render/rig.ts), so 6 knights and 30
 * footmen flashing add at most one full boost each; the bright aura stays at `auraAlpha`.
 */
export const SUPER_FLASH = { halfMs: 250, glow: 2, auraAlpha: 0.55 } as const;

/** Whether a unit under `effect` (the morale buff, `totalMs` long) is in its flash's on phase. */
export function superFlashOn(effect: StatusEffect | undefined, totalMs: number): boolean {
  if (!effect || effect.remaining <= 0 || totalMs <= 0) return false;
  const elapsed = Math.max(0, msToSteps(totalMs, SIM_HZ) - effect.remaining) * STEP_MS;
  return Math.floor(elapsed / SUPER_FLASH.halfMs) % 2 === 0;
}

/**
 * Lead from the Front's motes (C3 note: no link lines): small amber nanite motes drift slowly from
 * the Commander to each soldier his passive reaches, one every `everyMs` per soldier, at most `cap`
 * in flight per soldier, each taking `travelMs`.
 */
export const LEAD_MOTE = { everyMs: 520, travelMs: 1400, cap: 3 } as const;

/** The soldiers Lead from the Front affects now for the Commander in `slot` (the sim's aura). */
export function leadTargets(w: World, slot: number): Set<EntityId> {
  const out = new Set<EntityId>();
  for (const u of w.soldiers)
    if (u.owner === slot && u.hp > 0 && u.effects.some((e) => e.def === 'aura_lead_from_the_front'))
      out.add(u.id);
  return out;
}

export interface LeadMote {
  target: EntityId;
  age: number;
  seed: number;
}

/**
 * One Commander's mote emitter: emits only toward `targets` (staggered per soldier by a seeded
 * hash), and drops in-flight motes whose soldier left the effect, so none drift to units outside it.
 */
export class MoteStream {
  readonly motes: LeadMote[] = [];
  private readonly due = new Map<EntityId, number>();
  private seq = 0;

  constructor(private readonly key: number) {}

  step(dtMs: number, targets: ReadonlySet<EntityId>): { spawned: LeadMote[]; removed: LeadMote[] } {
    const spawned: LeadMote[] = [];
    const removed: LeadMote[] = [];
    const count = new Map<EntityId, number>();
    let n = 0;
    for (const m of this.motes) {
      m.age += dtMs;
      if (m.age >= LEAD_MOTE.travelMs || !targets.has(m.target)) {
        removed.push(m);
        continue;
      }
      this.motes[n++] = m;
      count.set(m.target, (count.get(m.target) ?? 0) + 1);
    }
    this.motes.length = n;
    for (const id of this.due.keys()) if (!targets.has(id)) this.due.delete(id);
    for (const id of targets) {
      let d = this.due.get(id);
      if (d === undefined) d = hash01(`lead:${this.key}:${id}`) * LEAD_MOTE.everyMs;
      else d -= dtMs;
      if (d <= 0) {
        if ((count.get(id) ?? 0) < LEAD_MOTE.cap) {
          const m = { target: id, age: 0, seed: this.seq++ };
          this.motes.push(m);
          spawned.push(m);
        }
        d = Math.max(d + LEAD_MOTE.everyMs, 1);
      }
      this.due.set(id, d);
    }
    return { spawned, removed };
  }
}

/**
 * Where a mote is at `u` (0..1) of its flight from `from` to `to`: eased, rising a little and
 * swaying to one side (seeded), fading in and out like the nanite cloud.
 */
export function moteDrift(
  from: ScreenPoint,
  to: ScreenPoint,
  u: number,
  seed: number,
): ScreenPoint & { alpha: number; scale: number } {
  const k = Math.min(1, Math.max(0, u));
  const e = k * k * (3 - 2 * k);
  const dx = to.sx - from.sx;
  const dy = to.sy - from.sy;
  const len = Math.hypot(dx, dy) || 1;
  const arc = Math.sin(Math.PI * k);
  const side = (hash01(`mote:${seed}`) - 0.5) * 2 * 12 * arc;
  return {
    sx: from.sx + dx * e + (-dy / len) * side,
    sy: from.sy + dy * e + (dx / len) * side - 10 * arc,
    alpha: Math.min(1, 5 * k) * Math.min(1, 5 * (1 - k)) * 0.9,
    scale: 0.8 + 0.25 * arc,
  };
}
