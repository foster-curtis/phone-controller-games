// TV-side remove (×) control (M7-fix-2): a small sticker button on every player row. First click
// arms it ("Remove?"), a second click within ARM_MS confirms; otherwise it disarms. Tokens only.
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import { addText } from '../scenes/ui';
import type { Rect, RemoveRects } from './layout';
import { drawSticker } from './sticker';

export const ARM_MS = 3000;

/** Which player's remove control is armed, and until when. Pure, so it is unit-tested. */
export class RemoveArm {
  private id: string | null = null;
  private at = 0;
  private shown = false;

  isArmed(id: string, now: number): boolean {
    return this.id === id && now - this.at < ARM_MS;
  }

  /**
   * Call when the armed "Remove?" is drawn: the window then counts from the first draw, so a slow
   * frame between the click and the redraw can't eat the time the viewer gets to confirm.
   */
  markShown(id: string, now: number): void {
    if (this.id !== id || this.shown) return;
    this.shown = true;
    this.at = now;
  }

  /** A click on `id`'s control: returns true when it confirms (second click inside the window). */
  press(id: string, now: number): boolean {
    if (this.isArmed(id, now)) {
      this.id = null;
      return true;
    }
    this.id = id;
    this.at = now;
    this.shown = false;
    return false;
  }

  clear(): void {
    this.id = null;
  }
}

export interface RemoveControls {
  arm: RemoveArm;
  remove(playerId: string): void;
  /** Called after an arm so the scene redraws at once. */
  changed(): void;
  /** Reports the clickable rect (canvas coordinates) for debug/e2e. */
  report(playerId: string, rect: Rect, hit: Rect): void;
  now(): number;
}

/** Draws one remove control; returns the objects made (the caller destroys them on refresh). */
export function addRemoveButton(
  scene: Phaser.Scene,
  rects: RemoveRects,
  playerId: string,
  ctl: RemoveControls,
  alpha = 1,
): Phaser.GameObjects.GameObject[] {
  const armed = ctl.arm.isArmed(playerId, ctl.now());
  if (armed) ctl.arm.markShown(playerId, ctl.now());
  const r = armed ? rects.armed : rects.idle;
  const g = scene.add.graphics().setDepth(5);
  drawSticker(g, r, (armed ? theme.color.danger : theme.color.surfaceStrong).num, {
    shadow: 'stickerSm',
    radius: theme.radius.pill,
    alpha,
  });
  const label = armed
    ? addText(scene, 0, 0, 'Remove?', 'tag', theme.color.dangerOn)
    : addText(scene, 0, 0, '×', 'pad', theme.color.foreground);
  label
    .setOrigin(0.5)
    .setPosition(r.x + r.w / 2, r.y + r.h / 2)
    .setDepth(6)
    .setAlpha(alpha);
  ctl.report(playerId, rects.idle, r);
  return [g, label];
}

export interface RemoveHit {
  playerId: string;
  hit: Rect;
}

/**
 * A pointer press at (x, y) in canvas coordinates: arms, or confirms and removes, the control
 * under it. Scene-level (not a Phaser zone per button) because the rows are rebuilt every
 * 250 ms and a freshly rebuilt interactive object can miss a click that lands at once.
 */
export function pressRemove(
  ctl: Pick<RemoveControls, 'arm' | 'remove' | 'changed' | 'now'>,
  buttons: readonly RemoveHit[],
  x: number,
  y: number,
): boolean {
  const b = buttons.find(
    ({ hit }) => x >= hit.x && x <= hit.x + hit.w && y >= hit.y && y <= hit.y + hit.h,
  );
  if (!b) return false;
  if (ctl.arm.press(b.playerId, ctl.now())) ctl.remove(b.playerId);
  ctl.changed();
  return true;
}
