// The Commander's TV extras (SPEC §2.4, §6.1; RD9): the "×2" that pops over the soldiers on a Rally
// Cry double spawn, and where it goes. One Text per pop, made once and reused: its texture is never
// redrawn (the frame-cost rule, scene/tag.ts); per frame only position and alpha move.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import type { RenderContext } from '../render/context';
import type { SoldierEnt, World } from '../sim/types';

export const DOUBLE_POP = { ms: 900, risePx: 34, liftPx: 58 } as const;

/** The pop's alpha and how far it has risen at `tMs`: in fast, hold, fade over the last third. */
export function doublePopLook(tMs: number): { alpha: number; rise: number } {
  const u = Math.min(1, Math.max(0, tMs / DOUBLE_POP.ms));
  const alpha = Math.min(1, u * 8) * Math.min(1, (1 - u) * 3);
  return { alpha, rise: DOUBLE_POP.risePx * (1 - (1 - u) * (1 - u)) };
}

/**
 * World point over this Commander's newest throw (its soldiers' landing spots), or null if none is
 * in the air. By launch tick, not the current one: the TV reads the event after the step has ended.
 */
export function thrownCenter(w: World, slot: number): { x: number; y: number } | null {
  const up = w.soldiers.filter(
    (u): u is SoldierEnt & { flight: NonNullable<SoldierEnt['flight']> } =>
      u.owner === slot && u.flight !== null,
  );
  if (up.length === 0) return null;
  const newest = Math.max(...up.map((u) => u.flight.launchedAt));
  let x = 0;
  let y = 0;
  let n = 0;
  for (const u of up) {
    if (u.flight.launchedAt !== newest) continue;
    n++;
    x += u.flight.to.x;
    y += u.flight.to.y;
  }
  return { x: x / n, y: y / n };
}

interface Pop {
  text: Phaser.GameObjects.Text;
  t: number;
  sx: number;
  sy: number;
  live: boolean;
}

export class DoublePops {
  private readonly pops: Pop[] = [];

  constructor(private readonly ctx: RenderContext) {}

  show(sx: number, sy: number) {
    let p = this.pops.find((x) => !x.live);
    if (!p) {
      const text = this.ctx.scene.add
        .text(0, 0, '×2', {
          fontFamily: theme.font.display,
          fontSize: '34px',
          fontStyle: '700',
          color: theme.color.amber.hex,
          stroke: theme.color.brandInk.hex,
          strokeThickness: 5,
        })
        .setOrigin(0.5, 1)
        .setVisible(false);
      this.ctx.layers.worldUi.add(text);
      p = { text, t: 0, sx: 0, sy: 0, live: false };
      this.pops.push(p);
    }
    p.t = 0;
    p.sx = sx;
    p.sy = sy - DOUBLE_POP.liftPx;
    p.live = true;
    p.text.setVisible(true);
  }

  update(dtMs: number) {
    for (const p of this.pops) {
      if (!p.live) continue;
      p.t += dtMs;
      if (p.t >= DOUBLE_POP.ms) {
        p.live = false;
        p.text.setVisible(false);
        continue;
      }
      const l = doublePopLook(p.t);
      p.text.setPosition(p.sx, p.sy - l.rise).setAlpha(l.alpha);
    }
  }

  destroy() {
    for (const p of this.pops) p.text.destroy();
    this.pops.length = 0;
  }
}
