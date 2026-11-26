// Stress mode (`?gallery=1&stress=1`): SPEC §15.2 peak load (6 knights, 30 footmen, 150 enemies,
// 100 projectiles) on the full map, animated along seeded paths, with the overlay of
// frame, render and bloom time (render/stressOverlay.ts). The real sim at peak is the in-game stress
// mode, `?debug=1&stress=1` (host/stress.ts).
import { StressOverlay } from '../stressOverlay';
import { pickFacing, type Facing } from '../aim';
import { Citadel } from '../structures';
import { MapView, tileHash } from '../map';
import type { ProjectileKind, ProjectileSprite } from '../types';
import type { RenderWorld } from '../world';
import type { Unit } from './pages';
import { RIG_INFO } from './rigInfo';
import { theme } from '../../../shared/theme';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';

const rnd = (i: number, salt: number) => tileHash(i, salt) / 0xffffffff;

interface Mover {
  unit: Unit;
  cx: number;
  cy: number;
  ax: number;
  ay: number;
  fx: number;
  fy: number;
  ph: number;
  facing: Facing | null;
  sideOnly: boolean;
}

export function runStress(world: RenderWorld): {
  tick: (dt: number, t: number) => void;
  units: Unit[];
} {
  const cam = world.camera;
  new MapView(world, world.theme.map);
  const citadel = new Citadel(world, 18, 2);
  citadel.setLoadout(true, true, true);
  const units: Unit[] = [];
  const movers: Mover[] = [];
  const spawn = (rigId: string, i: number, sideOnly: boolean, tint?: number) => {
    const info = RIG_INFO[rigId]!;
    const rig = world.rig(rigId, {
      tint,
      clip: 'walk',
      groups: rigId === 'commander' ? ['banner'] : [],
    });
    rig.play('walk', { offsetMs: rnd(i, 5) * 1000, speed: 0.85 + rnd(i, 6) * 0.3 });
    const unit: Unit = {
      rig,
      info,
      sx: 0,
      sy: 0,
      knight: !sideOnly && rigId !== 'footman',
      aim: 0,
      color: tint,
    };
    units.push(unit);
    movers.push({
      unit,
      cx: 3 + rnd(i, 1) * 30,
      cy: 5 + rnd(i, 2) * 16,
      ax: 1 + rnd(i, 3) * 3,
      ay: 0.5 + rnd(i, 4) * 2,
      fx: 0.15 + rnd(i, 7) * 0.25,
      fy: 0.1 + rnd(i, 8) * 0.2,
      ph: rnd(i, 9) * Math.PI * 2,
      facing: null,
      sideOnly,
    });
  };
  const knights = ['warden', 'ranger', 'commander', 'artificer', 'ranger', 'warden'];
  knights.forEach((k, i) => spawn(k, i, false, theme.players[PLAYER_COLOR_IDS[i]!].fill.num));
  for (let i = 0; i < 30; i++)
    spawn('footman', 100 + i, false, theme.players[PLAYER_COLOR_IDS[i % 6]!].fill.num);
  const mix: [string, number][] = [
    ['drone', 60],
    ['skitter', 20],
    ['brute', 10],
    ['bombard', 6],
    ['wasp', 14],
    ['mite', 32],
    ['stalker', 8],
  ];
  let n = 200;
  for (const [rig, count] of mix) for (let i = 0; i < count; i++) spawn(rig, n++, true);
  // 100 projectiles.
  const kinds: ProjectileKind[] = ['bolt', 'nanite-bolt', 'bombard-shell', 'boulder', 'wasp-shot'];
  const shots: { p: ProjectileSprite; i: number; arc: boolean }[] = Array.from(
    { length: 100 },
    (_, i) => {
      const kind = kinds[i % kinds.length]!;
      return { p: world.fx.projectile(kind), i, arc: kind.includes('shell') || kind === 'boulder' };
    },
  );

  const overlay = new StressOverlay(world);
  const tick = (dt: number, t: number) => {
    const s = t / 1000;
    for (const m of movers) {
      const x = m.cx + m.ax * Math.sin(s * m.fx * 2 + m.ph);
      const y = m.cy + m.ay * Math.sin(s * m.fy * 2 + m.ph * 1.3);
      const dx = m.ax * m.fx * Math.cos(s * m.fx * 2 + m.ph);
      const dy = m.ay * m.fy * 1.0 * Math.cos(s * m.fy * 2 + m.ph * 1.3);
      const fly = m.unit.info.fly ?? 0;
      const ground = cam.worldToScreen(x, y);
      const body = cam.worldToScreen(x, y, fly);
      m.unit.sx = ground.sx;
      m.unit.sy = ground.sy;
      m.unit.rig.setPosition(body.sx, body.sy, ground.sy);
      if (m.sideOnly) m.unit.rig.setView('side', dx < 0);
      else {
        m.facing = pickFacing(dx, dy, m.facing);
        m.unit.rig.setView(m.facing.view, m.facing.mirror);
        m.unit.aim = Math.atan2(dy, dx);
      }
    }
    for (const sh of shots) {
      const u = (s * 0.5 + rnd(sh.i, 11)) % 1;
      const x0 = 2 + rnd(sh.i, 12) * 30;
      const y0 = 4 + rnd(sh.i, 13) * 18;
      const ang = rnd(sh.i, 14) * Math.PI * 2;
      sh.p.set(
        x0 + Math.cos(ang) * u * 4,
        y0 + Math.sin(ang) * u * 4,
        sh.arc ? Math.sin(u * Math.PI) * 2 : 0.6,
        ang,
      );
    }
    citadel.update(dt);
    overlay.tick(dt);
  };
  return { tick, units };
}
