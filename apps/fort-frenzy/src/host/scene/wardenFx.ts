// The Warden's attacks on the TV (SPEC §2.4, §8; FF8): the slam and the stomp play their clips at
// once (the sim winds up for the same time), and on the impact frame the ground shockwave rolls out
// across the exact hit arc (§2.5: a 0.6 band of the sim's sector) from where the hammer or the foot
// lands, with sparks at the hammer head (C2 note 2: effects leave from the weapon).
import type { CharacterDef } from '../../content/types';
import { SLAM_IMPACT_MS, STOMP_IMPACT_MS } from '../render/clips/warden';
import type { RigSprite } from '../render/rig';
import type { RenderWorld } from '../render/world';
import type { SimEvent } from '../sim/types';

export function wardenAttack(
  w: RenderWorld,
  rig: RigSprite,
  e: Extract<SimEvent, { e: 'attack' }>,
  def: CharacterDef,
  later: (ms: number, fn: () => void) => void,
) {
  const main = e.slot === 'main';
  const a = main ? def.main : def.super;
  rig.play(main ? 'attack' : 'super', { restart: true, fadeMs: 40 });
  later(main ? SLAM_IMPACT_MS : STOMP_IMPACT_MS, () => {
    w.fx.arcWave?.('ours', e.x, e.y, a.range, e.angle, a.arcDeg ?? 90, main ? 320 : 480);
    if (main) {
      const h = rig.attach('hammer');
      if (h) {
        w.fx.burst('spark-ours', h.sx, h.sy);
        w.fx.burst('spark-ours', h.sx + 8, h.sy - 4, 0, 50);
      }
      return;
    }
    // The stomp: the shockwave and a ring of sparks at his feet.
    const f = w.camera.worldToScreen(e.x, e.y);
    for (let i = 0; i < 4; i++) {
      const ang = e.angle + ((i - 1.5) / 3) * (((a.arcDeg ?? 90) * Math.PI) / 180);
      const p = w.camera.worldToScreen(e.x + Math.cos(ang) * 0.7, e.y + Math.sin(ang) * 0.7);
      w.fx.burst('spark-ours', p.sx, p.sy - 4, 0, i * 30);
    }
    w.fx.burst('spark-ours', f.sx, f.sy - 6);
  });
}
