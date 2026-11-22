// The Warden's attacks on the TV (SPEC §2.4, §8; FF8, RD5): the slam and the jump slam play their
// clips at once (the sim winds up for the same time), and on the impact frame the ground shockwave
// rolls out across the exact hit arc (§2.5: a 0.6 band of the sim's sector) from where the hammer or
// the landing is, with sparks at the hammer head (C2 note 2: effects leave from the weapon). The
// slam leaves `slam-cracks` at the hammer's ground point (about 1 s); the jump slam's landing leaves
// `landing-dust` at his feet and `slam-cracks-wide` at the same point.
import type { KnightDef } from '../../content/types';
import { JUMP_IMPACT_MS, SLAM_IMPACT_MS } from '../render/clips/warden';
import type { RigSprite } from '../render/rig';
import type { RenderWorld } from '../render/world';
import type { SimEvent } from '../sim/types';

/** The cracks fade over this long after the impact, ms. */
export const CRACKS_MS = 1000;

export function wardenAttack(
  w: RenderWorld,
  rig: RigSprite,
  e: Extract<SimEvent, { e: 'attack' }>,
  def: KnightDef,
  later: (ms: number, fn: () => void) => void,
) {
  const main = e.slot === 'main';
  const a = main ? def.main : def.super;
  rig.play(main ? 'attack' : 'super', { restart: true, fadeMs: 40 });
  later(main ? SLAM_IMPACT_MS : JUMP_IMPACT_MS, () => {
    w.fx.arcWave?.('ours', e.x, e.y, a.range, e.angle, a.arcDeg ?? 90, main ? 320 : 480);
    // Cracks split out from where the head lands (the `hammer-ground` attach point).
    const ground = rig.attach('hammer-ground');
    if (main) {
      if (ground) w.fx.mark?.('slam-cracks', ground.sx, ground.sy, CRACKS_MS);
      const h = rig.attach('hammer');
      if (h) {
        w.fx.burst('spark-ours', h.sx, h.sy);
        w.fx.burst('spark-ours', h.sx + 8, h.sy - 4, 0, 50);
      }
      return;
    }
    // The jump slam's landing: dust ring at his feet, wide cracks from the hammer, and sparks.
    const f = w.camera.worldToScreen(e.x, e.y);
    w.fx.mark?.('landing-dust', f.sx, f.sy, CRACKS_MS * 0.7);
    if (ground) w.fx.mark?.('slam-cracks-wide', ground.sx, ground.sy, CRACKS_MS);
    for (let i = 0; i < 4; i++) {
      const ang = e.angle + ((i - 1.5) / 3) * (((a.arcDeg ?? 90) * Math.PI) / 180);
      const p = w.camera.worldToScreen(e.x + Math.cos(ang) * 0.7, e.y + Math.sin(ang) * 0.7);
      w.fx.burst('spark-ours', p.sx, p.sy - 4, 0, i * 30);
    }
    w.fx.burst('spark-ours', f.sx, f.sy - 6);
  });
}
