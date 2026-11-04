// The gallery's Colossus page (FF11, SPEC §9.6): every tier (Mk I, II, III, final) × every clip
// (idle, walk with the leg order swap, slam, throw, call, stagger kneel, hit, death), looping, with
// the looks code draws in the run (render/colossusLook.ts): head tracking sweeping on the walk, the
// core by stagger meter (filling on idle, flaring on the kneel), fist flares and the red marker over
// the slam's wind-up, spire surges on the call, plumes on the final tier, and the impact rings
// (a long rolling shockwave on the final tier's slam).
import type * as Phaser from 'phaser';
import { theme } from '../../../shared/theme';
import { COLOSSUS_CALL_MS, COLOSSUS_SLAM_MS, COLOSSUS_THROW_MS } from '../clips/colossus';
import { coreHz, coreLook, drawCore, headTarget, spiresFor } from '../colossusLook';
import { clipLandedMs, spawnPile } from '../fall';
import type { PageKit } from './pages';
import { RIG_INFO } from './rigInfo';
import { colossusGroups } from './state';

export const COLOSSUS_PAGE_CLIPS = [
  'idle',
  'walk',
  'slam',
  'throw',
  'call',
  'stagger',
  'hit',
  'death',
] as const;

/** Loop period per one-shot, ms. */
const PERIOD: Record<string, number> = {
  slam: 2600,
  throw: 1900,
  call: 1800,
  stagger: 3400,
  hit: 1200,
};

/** A wind-up's 0..1 charge at `age` of `ms`, gone after the release. */
const charge = (age: number, ms: number) =>
  age < 0 || age > ms + 80 ? 0 : age >= ms ? 1 - (age - ms) / 80 : (age / ms) ** 2;

export function colossusPage(k: PageKit) {
  const w = k.world;
  const info = RIG_INFO.colossus!;
  const g: Phaser.GameObjects.Graphics = w.scene.make.graphics({}, false).setDepth(1e6);
  w.layers.effects.add(g);
  const ground: Phaser.GameObjects.Graphics = w.scene.make.graphics({}, false).setDepth(-4e5);
  w.layers.groundOverlay.add(ground);
  const o = w.camera.worldToScreen(0, 0);
  const one = w.camera.worldToScreen(1, 1);
  const worldAt = (sx: number, sy: number): [number, number] => [
    (sx - o.sx) / (one.sx - o.sx),
    (sy - o.sy) / (one.sy - o.sy),
  ];
  const cells: {
    rig: ReturnType<typeof w.rig>;
    clip: string;
    tier: number;
    sx: number;
    sy: number;
  }[] = [];
  ([1, 2, 3, 4] as const).forEach((tier, row) => {
    const sy = 250 + row * 245;
    COLOSSUS_PAGE_CLIPS.forEach((clip, col) => {
      const sx = 135 + col * 236;
      const rig = w.rig('colossus', { view: 'side', groups: colossusGroups(tier), clip: 'idle' });
      rig.setPosition(sx, sy, sy);
      rig.setUnlit(k.state.unlit || clip === 'death');
      rig.play(clip, { fadeMs: 0 });
      k.units.push({ rig, info, sx, sy, knight: false, aim: null });
      cells.push({ rig, clip, tier, sx, sy });
      if (row === 0) k.label(clip, sx, 18);
    });
    k.label(tier === 4 ? 'final' : `mk${tier}`, 30, sy - 90, 14);
  });

  k.tick((dt, t) => {
    g.clear();
    ground.clear();
    for (const c of cells) {
      const { rig, clip, tier, sx, sy } = c;
      const mk = Math.min(3, tier) as 1 | 2 | 3;
      const period = PERIOD[clip];
      const age = period === undefined ? t : t % period;
      if (period !== undefined && Math.floor(t / period) !== Math.floor((t - dt) / period)) {
        rig.play(clip, { restart: true, fadeMs: 0 });
        if (clip === 'hit') rig.flash(60);
      }
      if (clip === 'death') {
        const death = w.theme.clips['colossus/death']!;
        const p = death.durationMs + 700;
        if (Math.floor(t / p) !== Math.floor((t - dt) / p)) {
          rig.play('death', { restart: true, fadeMs: 0 });
          rig.flash(60);
        }
        const land = clipLandedMs(death);
        if ((t - dt) % p < land && t % p >= land)
          spawnPile(w.fx, 'theirs', sx, sy, w.unitPx, {
            big: true,
            holdMs: death.durationMs - land,
            seed: 'colossus',
          });
        continue;
      }
      // Head tracking: the walk sweeps up and down the screen; attacks snap to the front.
      const head = clip === 'walk' ? headTarget(Math.sin(t * 0.0015) * 1.4) : { rot: 0, dy: 0 };
      rig.override('head', head);
      // The core: the meter fills on idle, flares on the kneel.
      const meter = clip === 'idle' ? (t % 4000) / 4000 : 0.3;
      const core = rig.attach('core');
      if (core && !k.state.unlit)
        drawCore(
          g,
          core.sx,
          core.sy,
          w.unitPx,
          coreLook(meter, clip === 'stagger', tier === 4, (t / 1000) * coreHz(meter)),
        );
      if (tier === 4) {
        for (const s of spiresFor(3)) {
          const p = rig.attach(s);
          if (p) drawCore(g, p.sx, p.sy - 4, w.unitPx, { r: 7, level: 0.45, flare: false });
        }
      }
      if (clip === 'slam' || clip === 'throw') {
        const ms = clip === 'slam' ? COLOSSUS_SLAM_MS : COLOSSUS_THROW_MS;
        const lvl = charge(age, ms);
        for (const a of clip === 'slam' ? ['fist-near', 'fist-far'] : ['fist-near']) {
          const p = rig.attach(a);
          if (p) drawCore(g, p.sx, p.sy - 6, w.unitPx, { r: 8, level: lvl, flare: false });
        }
        // The red marker: in front for the slam, further out for the boulder.
        if (age < ms) {
          const [x, y] = worldAt(sx, sy);
          const at = w.camera.worldToScreen(x + (clip === 'slam' ? 1.6 : 2.4), y + 0.2);
          const { rx, ry } = w.camera.groundEllipse(clip === 'slam' ? 1.5 : 1.2);
          const u = age / ms;
          ground
            .lineStyle(3, theme.color.danger.num, 0.9)
            .strokeEllipse(at.sx, at.sy, rx * 2, ry * 2)
            .fillStyle(theme.color.danger.num, 0.18 + 0.25 * u)
            .fillEllipse(at.sx, at.sy, rx * 2 * u, ry * 2 * u);
        }
        if ((t - dt) % period! < ms && age >= ms) {
          const [x, y] = worldAt(sx, sy);
          w.fx.ring('theirs', x + (clip === 'slam' ? 1.6 : 2.4), y + 0.2, 1.5, 420);
          if (clip === 'slam' && tier === 4) w.fx.ring('theirs', x + 1.6, y + 0.2, 5.5, 650);
        }
      }
      if (clip === 'call' && mk >= 2) {
        const lvl = charge(age, COLOSSUS_CALL_MS) * 1.3;
        for (const s of spiresFor(mk)) {
          const p = rig.attach(s);
          if (p) drawCore(g, p.sx, p.sy, w.unitPx, { r: 9, level: lvl, flare: false });
        }
        if ((t - dt) % period! < COLOSSUS_CALL_MS && age >= COLOSSUS_CALL_MS) {
          for (const s of spiresFor(mk)) {
            const p = rig.attach(s);
            if (p) w.fx.burst('spark-theirs', p.sx, p.sy - 6);
          }
        }
      }
    }
  });
}
