// Pure pieces of the support classes' TV drawing (SPEC §2.4; FF9, RD9), tested headless: where a
// knight's shots leave from, Warcry's morale flash and its aura's fade, and the Field Medic circle's
// dots.

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

/** Warcry's aura alpha: full when cast, fading to nothing as its morale runs out. */
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
 * Warcry's flash (the old morale super's, §6.1): a knight it reaches has his amber parts and the aura
 * under him flash on and off for the effect's duration. `glow` 2 is the cap: a rig's additive boost
 * is full at 2 (render/rig.ts); the bright aura stays at `auraAlpha`.
 */
export const SUPER_FLASH = { halfMs: 250, glow: 2, auraAlpha: 0.55 } as const;

/** Whether the flash is in its on phase `elapsedMs` into a Warcry `totalMs` long. */
export function warcryFlashOn(elapsedMs: number, totalMs: number): boolean {
  if (elapsedMs < 0 || elapsedMs >= totalMs) return false;
  return Math.floor(elapsedMs / SUPER_FLASH.halfMs) % 2 === 0;
}
