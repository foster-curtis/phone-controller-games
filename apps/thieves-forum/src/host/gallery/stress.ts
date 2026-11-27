// Gallery stress view (SPEC §12.2 performance target, §7 crowd): the full 8-player crowd (8 players
// + the planned NPCs for 8 players from balance, 4 guards, 10 merchants in 10 open stalls) walking random paths over a paved market,
// with an FPS readout. Rendering only; TF7 logs the real scene's frame rate.
import { SHOP_IDS, balance, itemsOf } from '../../content';
import { addPiece, placePiece } from '../render/atlas';
import { CANVAS_W } from '../render/camera';
import type { RigSprite } from '../render/rig';
import type { RigId } from '../render/types';
import { plannedNpcs } from '../sim/npc/churn';
import { randomLook, randomOutfit, type PageKit } from './pages';

/** The stress crowd: 8 players plus their planned NPCs (TF2-fix-1: follows balance). */
export const STRESS_PLAYERS = 8;
export const STRESS = {
  citizens: STRESS_PLAYERS + plannedNpcs(STRESS_PLAYERS, balance),
  guards: 4,
  merchants: 10,
} as const;

interface Walker {
  rig: RigSprite;
  x: number;
  y: number;
  tx: number;
  ty: number;
  speed: number;
  wait: number;
  moving: string;
}

/** Lane band under the two stall rows (screen px). */
const LANE = { x0: 40, x1: CANVAS_W - 40, y0: 380, y1: 1060 };

export function runStress(kit: PageKit): { fps(): number; parts(): number } {
  const { world } = kit;
  // Paving.
  for (let x = 0; x < CANVAS_W; x += 48)
    for (let y = 0; y < 1080; y += 28.8) {
      const p = world.lib.piece('floor-tile');
      placePiece(p, x, y, 0.6);
      addPiece(p, world.layers.ground);
    }
  // Ten open stalls, two rows (positions are TF7's layout work; this is load only).
  const u = 2.4;
  SHOP_IDS.forEach((shop, i) => {
    const s = world.stall(shop, u);
    // Second row sits lower and offset; the real layout is TF7's, this loads the same pieces.
    s.setPosition(40 + (i % 5) * 380 + (i >= 5 ? 190 : 0), i >= 5 ? 170 : 0);
    const items = itemsOf(shop);
    s.setItems(
      items.filter((it) => it.placement === 'counter').map((it) => it.id),
      items.filter((it) => it.placement === 'shelf').map((it) => it.id),
    );
    const m = world.rig(
      'merchant',
      { scale: u / 3, tints: randomLook('merchant') },
      s.merchantParent,
    );
    s.setMerchant(m);
  });
  const walkers: Walker[] = [];
  const add = (id: RigId, n: number) => {
    for (let i = 0; i < n; i++) {
      const rig = world.rig(id, id === 'citizen' ? { outfit: randomOutfit() } : {});
      const x = LANE.x0 + Math.random() * (LANE.x1 - LANE.x0);
      const y = LANE.y0 + Math.random() * (LANE.y1 - LANE.y0);
      walkers.push({
        rig,
        x,
        y,
        tx: x,
        ty: y,
        speed: id === 'guard' ? 70 : 50 + Math.random() * 20,
        wait: Math.random() * 1000,
        moving: id === 'guard' ? 'patrol' : 'walk',
      });
    }
  };
  add('citizen', STRESS.citizens);
  add('guard', STRESS.guards);
  let frames = 0;
  let acc = 0;
  let fps = 0;
  kit.tick((dt) => {
    frames++;
    acc += dt;
    if (acc >= 500) {
      fps = (frames * 1000) / acc;
      frames = 0;
      acc = 0;
    }
    for (const w of walkers) {
      const dx = w.tx - w.x;
      const dy = w.ty - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) {
        w.rig.play('idle');
        w.wait -= dt;
        if (w.wait <= 0) {
          w.tx = LANE.x0 + Math.random() * (LANE.x1 - LANE.x0);
          w.ty = LANE.y0 + Math.random() * (LANE.y1 - LANE.y0);
          w.wait = 500 + Math.random() * 2000;
        }
      } else {
        const step = Math.min(d, (w.speed * dt) / 1000);
        w.x += (dx / d) * step;
        w.y += (dy / d) * step;
        w.rig.face(Math.atan2(dy / 0.6, dx));
        w.rig.play(w.moving);
      }
      w.rig.setPosition(w.x, w.y);
    }
  });
  return {
    fps: () => fps,
    parts: () => [...world.rigs].reduce((n, r) => n + r.partCount, 0),
  };
}
