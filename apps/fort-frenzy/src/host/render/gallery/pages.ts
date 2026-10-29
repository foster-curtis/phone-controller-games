// Gallery pages (BUILD_PLAN FF3): every rig × view × pose × clip, turret tiers × aims and mortars,
// the Citadel at each stage with sentries, all 16 autotile masks, effects and statuses, every icon
// as a world-UI badge, and the map with lanes open or sealed.
import { manifest } from '../../../../generated/manifest';
import { LANE_IDS } from '../../../shared/ids';
import { theme } from '../../../shared/theme';
import type { ThemeAssets, ViewId } from '../../../themes/types';
import { ALL_MASKS } from '../autotile';
import { placeFrame } from '../context';
import {
  fk,
  iconFrame,
  netFrame,
  scrapFrame,
  sentryFrame,
  wallChargedFrame,
  wallDmgFrame,
  wallFrame,
  wallRailFrame,
} from '../keys';
import { MapView } from '../map';
import type { RigSprite } from '../rig';
import { StatusSprites } from '../status';
import { Citadel, Mortar, NetField, PulseTurret, WallField, frameAt } from '../structures';
import { tileHash } from '../map';
import {
  SENTRY_AIMS,
  SENTRY_LOADOUTS,
  TURRET_AIMS,
  type BurstKind,
  type IconKey,
  type ProjectileKind,
  type StatusLook,
  type TowerTier,
} from '../types';
import type { RenderWorld } from '../world';
import { RIG_INFO, type RigInfo } from './rigInfo';
import { colossusGroups, gaugeGroups, type GalleryState, type PageId } from './state';

export interface Unit {
  rig: RigSprite;
  info: RigInfo;
  sx: number;
  sy: number;
  knight: boolean;
  aim: number | null;
  /** Ring color (default: the gallery color). */
  color?: number;
  status?: StatusSprites;
}

export interface PageKit {
  world: RenderWorld;
  state: GalleryState;
  units: Unit[];
  /** Hitbox overlay circles that aren't units (structures): screen point + radius (tiles). */
  hitboxes: { sx: number; sy: number; r: number }[];
  label(text: string, sx: number, sy: number, size?: number): void;
  tick(fn: (dtMs: number, tMs: number) => void): void;
}

const KNIGHTS = new Set(['warden', 'ranger', 'commander', 'artificer']);

function addRig(
  k: PageKit,
  rigId: string,
  sx: number,
  sy: number,
  view: ViewId,
  pose?: string,
): Unit {
  const s = k.state;
  const groups: string[] = [];
  if (rigId === 'commander' && s.banner) groups.push('banner');
  if (rigId === 'artificer') groups.push(...gaugeGroups(s.gauge));
  if (rigId === 'colossus') groups.push(...colossusGroups(s.colossus));
  if (rigId === 'mortar') {
    groups.push(
      ...(s.tier >= 1 ? ['band1'] : []),
      ...(s.tier >= 2 ? ['band2', 'ii'] : []),
      ...(s.tier >= 3 ? ['band3', 'iii'] : []),
    );
  }
  const rig = k.world.rig(rigId, {
    view,
    tint: theme.players[s.color].fill.num,
    groups,
    clip: 'idle',
  });
  if (pose) rig.setPose(pose, 0);
  const info = RIG_INFO[rigId]!;
  const fly = info.fly ?? 0;
  rig.setPosition(sx, sy - fly * 48, sy);
  rig.setUnlit(s.unlit);
  const clip = s.clip;
  const oneShot = clip === 'hit' || clip === 'down' || clip === 'respawn';
  if (!rig.play(clip, { fadeMs: 0 })) rig.play('idle', { fadeMs: 0 });
  else if (oneShot) {
    k.tick((_dt, t) => {
      if (Math.floor(t / 1600) !== Math.floor((t - _dt) / 1600)) {
        rig.play(clip, { restart: true, fadeMs: 0 });
        if (clip === 'hit') rig.flash(60);
      }
    });
  }
  const unit: Unit = {
    rig,
    info,
    sx,
    sy,
    knight: KNIGHTS.has(rigId),
    aim: view === 'side' ? 0 : view === 'front' ? Math.PI / 2 : -Math.PI / 2,
  };
  k.units.push(unit);
  return unit;
}

// ---- rigs ------------------------------------------------------------------------------------------

function rigsPage(k: PageKit) {
  const colX = (i: number) => 140 + i * 205;
  const views: ViewId[] = ['side', 'front', 'back'];
  const rowA = 400;
  ['warden', 'commander', 'artificer'].forEach((rig, r) =>
    views.forEach((v, j) => {
      addRig(k, rig, colX(r * 3 + j), rowA, v);
      k.label(`${rig} ${v}`, colX(r * 3 + j), rowA + 34);
    }),
  );
  const rowB = 660;
  ['stand', 'ready'].forEach((pose, r) =>
    views.forEach((v, j) => {
      addRig(k, 'ranger', colX(r * 3 + j), rowB, v, pose);
      k.label(`ranger ${v} ${pose}`, colX(r * 3 + j), rowB + 34);
    }),
  );
  views.forEach((v, j) => {
    addRig(k, 'footman', colX(6 + j), rowB, v);
    k.label(`footman ${v}`, colX(6 + j), rowB + 34);
  });
  const rowC = 960;
  const enemies = [
    'drone',
    'skitter',
    'brute',
    'bombard',
    'wasp',
    'mite',
    'stalker',
    'colossus',
    'mortar',
  ];
  enemies.forEach((rig, i) => {
    if (rig === 'mite') {
      // A pack of 8: scattered, mixed sizes, all facing the same general way (§9.6).
      for (let m = 0; m < 8; m++) {
        const h = tileHash(m, 3);
        const u = addRig(k, 'mite', colX(i) - 40 + (h % 80), rowC - 30 + ((h >>> 8) % 40), 'side');
        u.rig.play(k.state.clip === 'walk' ? 'walk' : 'idle', {
          offsetMs: h % 500,
          speed: 0.8 + ((h >>> 16) % 40) / 100,
        });
      }
    } else addRig(k, rig, colX(i), rowC, 'side');
    k.label(
      rig === 'colossus'
        ? `colossus mk${k.state.colossus === 4 ? ' final' : k.state.colossus}`
        : rig,
      colX(i),
      rowC + 34,
    );
  });
}

// ---- turrets + mortars -----------------------------------------------------------------------------

function turretsPage(k: PageKit) {
  const w = k.world;
  ([0, 1, 2, 3] as TowerTier[]).forEach((tier, row) => {
    const y = 2 + row * 4;
    TURRET_AIMS.forEach((aim, i) => {
      const t = new PulseTurret(w, 2 + i * 3, y);
      t.setTier(tier);
      t.setAim(aim);
      t.setUnlit(k.state.unlit);
      k.hitboxes.push({ sx: t.sx, sy: t.sy, r: 0.5 });
      if (row === 0) k.label(aim, t.sx, t.sy + 26);
    });
    const p = w.camera.worldToScreen(0.6, y);
    k.label(
      tier === 0 ? 'unupgraded' : `tier ${'I'.repeat(tier).replace('III', 'III')}`,
      p.sx,
      p.sy - 10,
    );
  });
  // A tracking turret: 8° hysteresis on a sweeping target.
  const tracker = new PulseTurret(w, 28, 6);
  tracker.setTier(2);
  k.label('tracking (8° hysteresis)', tracker.sx, tracker.sy + 26);
  k.tick((_dt, t) => {
    const a = t / 1400;
    tracker.aimAt(a);
    if (Math.floor(t / 500) !== Math.floor((t - _dt) / 500)) {
      const m = tracker.muzzle(1);
      if (m) w.fx.burst('muzzle-ours', m.sx, m.sy, Math.atan2(Math.sin(a) * 0.6, Math.cos(a)));
    }
  });
  // Damage, defense bonus and Fortify.
  const dmg = new PulseTurret(w, 28, 10);
  dmg.setTier(1);
  dmg.setDamaged(true);
  k.label('damaged', dmg.sx, dmg.sy + 26);
  const bonus = new PulseTurret(w, 31, 10);
  bonus.setTier(1);
  bonus.setDefenseBonus(true);
  k.label('defense bonus', bonus.sx, bonus.sy + 26);
  const fort = new PulseTurret(w, 31, 14);
  fort.setTier(3);
  fort.setFortify(true);
  k.label('fortify', fort.sx, fort.sy + 26);
  // Mortars: tiers 0–III and damaged, tubes sweeping within ±75°.
  const mortars: Mortar[] = [];
  ([0, 1, 2, 3] as TowerTier[]).forEach((tier, i) => {
    const m = new Mortar(w, w.rig('mortar'), 2 + i * 4, 20);
    m.setTier(tier);
    m.rig.setUnlit(k.state.unlit);
    mortars.push(m);
    k.label(`mortar ${tier === 0 ? 'base' : 'I'.repeat(tier)}`, m.sx, m.sy + 26);
  });
  const dm = new Mortar(w, w.rig('mortar'), 18, 20);
  dm.setTier(2);
  dm.setDamaged(true);
  mortars.push(dm);
  k.label('mortar damaged', dm.sx, dm.sy + 26);
  const clamp = new Mortar(w, w.rig('mortar'), 22, 20);
  clamp.aimScreen(1, 0.4); // a target below the horizon: clamps to +75°
  k.label('clamped +75°', clamp.sx, clamp.sy + 26);
  k.tick((_dt, t) => {
    mortars.forEach((m, i) => m.aimScreen(Math.sin(t / 900 + i), -1));
  });
}

// ---- Citadel + sentries ----------------------------------------------------------------------------

function citadelPage(k: PageKit) {
  const w = k.world;
  const xs = [3.5, 10, 16.5, 23, 29.5];
  const loadouts: [boolean, boolean, boolean][] = [
    [false, false, true],
    [true, false, false],
    [false, true, true],
    [true, true, true],
    [false, false, false],
  ];
  xs.forEach((x, i) => {
    const c = new Citadel(w, x, 8);
    if (i < 4) c.setStage(i as 0 | 1 | 2 | 3);
    else c.setDestroyed(true);
    const [d, r, third] = loadouts[i]!;
    c.setLoadout(d, r, third);
    k.label(
      i < 4 ? ['stage 0', 'cracks (66%)', '+ fire (33%)', '+ smoke (10%)'][i]! : 'destroyed',
      c.sx,
      c.sy + 24,
    );
    k.tick((dt, t) => {
      c.aimSentryAt('left', Math.PI / 2 + Math.sin(t / 1100 + i) * 1.4);
      c.aimSentryAt('right', Math.PI / 2 + Math.sin(t / 1300 + i) * 1.4);
      if (Math.floor(t / 2500) !== Math.floor((t - dt) / 2500) && i === 0) c.hit();
      c.update(dt);
    });
  });
  // Sentries: 4 loadouts × 5 aims.
  SENTRY_LOADOUTS.forEach((lo, row) => {
    SENTRY_AIMS.forEach((aim, i) => {
      const p = w.camera.worldToScreen(5 + i * 3, 14 + row * 3);
      placeFrame(w, sentryFrame(lo, aim), 'world', p.sx, p.sy, { origin: [0, 0] });
      if (row === 0) k.label(aim, p.sx, p.sy - 60);
    });
    const p = w.camera.worldToScreen(1.5, 14 + row * 3);
    k.label(lo, p.sx, p.sy);
  });
  // The window sentry at 0.62 for each loadout.
  SENTRY_LOADOUTS.forEach((lo, i) => {
    const p = w.camera.worldToScreen(22 + i * 3, 17);
    placeFrame(w, sentryFrame(lo, 'c'), 'world', p.sx, p.sy, { origin: [0, 0], scale: 0.62 });
    k.label(`window ${lo}`, p.sx, p.sy + 28);
  });
}

// ---- autotiles -------------------------------------------------------------------------------------

function autotilesPage(k: PageKit) {
  const w = k.world;
  const rows: [string, (m: number) => string[]][] = [
    ['wall + rail', (m) => [wallRailFrame(m), wallFrame(m)]],
    ['charged', (m) => [wallRailFrame(m), wallFrame(m), wallChargedFrame(m)]],
    ['damaged', (m) => [wallRailFrame(m), wallFrame(m), wallDmgFrame(m)]],
    ['shock net', (m) => [netFrame(m)]],
  ];
  rows.forEach(([name, frames], row) => {
    const y = 2.5 + row * 3.4;
    for (const m of ALL_MASKS) {
      const p = w.camera.worldToScreen(3.5 + m * 2, y);
      frames(m).forEach((f, j) => {
        const ground = f.startsWith('wall/rail') || f.startsWith('shock-net');
        placeFrame(w, f, ground ? 'groundOverlay' : 'world', p.sx, p.sy, {
          sortY: p.sy + j * 0.001,
          unlit: k.state.unlit,
        });
      });
      if (row === 0) k.label(`m${m}`, p.sx, p.sy - 70);
    }
    const p = w.camera.worldToScreen(0.8, y);
    k.label(name, p.sx, p.sy);
  });
  // Sample layouts: masks computed from neighbors (shared posts drawn once).
  const walls = new WallField(w);
  const layout: [number, number][] = [
    [3, 16],
    [4, 16],
    [5, 16],
    [6, 16],
    [6, 17],
    [6, 18],
    [6, 19],
    [5, 19],
    [4, 19],
    [3, 19],
    [3, 18],
    [3, 17],
    [9, 16],
    [9, 17],
    [9, 18],
    [10, 17],
    [11, 17],
    [13, 18],
    [14, 18],
    [14, 17],
    [15, 18],
    [14, 19],
  ];
  walls.set(
    layout.map(([c, r], i) => ({ c, r, charged: i % 5 === 1 || c >= 13, damaged: i % 4 === 3 })),
    k.state.unlit,
  );
  const wl = w.camera.worldToScreen(9, 21.4);
  k.label('wall layout (charged + damaged mixed)', wl.sx, wl.sy);
  const nets = new NetField(w);
  nets.set(
    [
      [19, 16],
      [20, 16],
      [21, 16],
      [19, 17],
      [20, 17],
      [21, 17],
      [23, 16],
      [23, 17],
      [24, 17],
      [26, 18],
      [27, 18],
      [28, 18],
      [27, 17],
      [27, 19],
    ].map(([c, r]) => ({ c: c!, r: r! })),
  );
  const nl = w.camera.worldToScreen(23.5, 21.4);
  k.label('shock net layout', nl.sx, nl.sy);
}

// ---- effects + statuses ----------------------------------------------------------------------------

function effectsPage(k: PageKit) {
  const w = k.world;
  const at = (x: number, y: number) => w.camera.worldToScreen(x, y);
  // Projectiles at a few headings (static) and in flight (arcs sort by their shadow).
  const kinds: ProjectileKind[] = [
    'bolt',
    'nanite-bolt',
    'mortar-shell',
    'bombard-shell',
    'boulder',
    'wasp-shot',
    'power-cell',
  ];
  kinds.forEach((kind, i) => {
    const pr = w.fx.projectile(kind);
    pr.set(2.5 + i * 2.5, 3, 0, -0.5);
    const p = at(2.5 + i * 2.5, 3);
    k.label(kind, p.sx, p.sy + 22);
    const fly = w.fx.projectile(kind);
    k.tick((_dt, t) => {
      const u = (t / 1600 + i * 0.13) % 1;
      const arc =
        kind === 'mortar-shell' ||
        kind === 'bombard-shell' ||
        kind === 'boulder' ||
        kind === 'power-cell';
      fly.set(2 + i * 2.5 + u * 2, 6, arc ? Math.sin(u * Math.PI) * 1.5 : 0.6, 0);
    });
  });
  // Bursts, re-spawned on a loop.
  const bursts: BurstKind[] = [
    'spark-ours',
    'spark-theirs',
    'heal-glint',
    'nanite-mote',
    'muzzle-ours',
    'muzzle-theirs',
  ];
  bursts.forEach((b, i) => {
    const p = at(21 + i * 2.3, 3);
    k.label(b, p.sx, p.sy + 22);
    k.tick((dt, t) => {
      if (Math.floor(t / 250) !== Math.floor((t - dt) / 250)) w.fx.burst(b, p.sx, p.sy - 10);
    });
  });
  // Tracers, rings, wall strike.
  k.tick((dt, t) => {
    if (Math.floor(t / 300) === Math.floor((t - dt) / 300)) return;
    const a = at(21, 6.5);
    const b = at(26, 5.5);
    w.fx.tracer('ours', a, b);
    w.fx.tracer('theirs', at(21, 8), at(26, 9));
    w.fx.ring('ours', 29, 7.5, 1.2);
    w.fx.ring('theirs', 32, 7.5, 1.2);
    w.fx.ring('danger', 29, 10.5, 1.2);
    w.fx.wallStrike(at(30, 10.5), at(33, 9.5));
  });
  // Scrap: ours and theirs, 1–5.
  (['ours', 'theirs'] as const).forEach((side, row) => {
    for (let s = 1; s <= 5; s++) {
      const p = at(2.5 + (s - 1) * 2.5 + row * 13, 10);
      placeFrame(w, scrapFrame(side, s), 'world', p.sx, p.sy);
      k.label(`scrap-${side}-${s}`, p.sx, p.sy + 20);
    }
  });
  // Structures and pieces that aren't rigs.
  const pieces: [string, string, 'ground' | 'groundOverlay' | 'world'][] = [
    ['armory pad', fk('armory/pad'), 'ground'],
    ['armory kiosk', fk('armory/kiosk'), 'world'],
    ['build ghost valid', fk('build-ghost/valid'), 'groundOverlay'],
    ['build ghost blocked', fk('build-ghost/blocked'), 'groundOverlay'],
    ['deploy beacon', fk('deploy-beacon'), 'world'],
    ['power cell', fk('power-cell'), 'world'],
  ];
  pieces.forEach(([name, f, layer], i) => {
    const x = i === 1 ? 2.5 : 2.5 + i * 3;
    frameAt(w, f, layer, x, 14);
    if (i !== 0) k.label(name, at(x, 14).sx, at(x, 14).sy + 22);
    else k.label('armory', at(x, 14).sx, at(x, 14).sy + 34);
  });
  // Rally flag: ring (ground), pole, cloth (player color), trim.
  const fp = at(21, 14);
  placeFrame(w, fk('rally-flag/ring'), 'groundOverlay', fp.sx, fp.sy);
  placeFrame(w, fk('rally-flag/pole'), 'world', fp.sx, fp.sy, { sortY: fp.sy });
  const cloth = placeFrame(w, fk('rally-flag/cloth'), 'world', fp.sx, fp.sy, {
    sortY: fp.sy + 0.001,
  });
  cloth.img.setTint(theme.players[k.state.color].fill.num);
  placeFrame(w, fk('rally-flag/cloth-trim'), 'world', fp.sx, fp.sy, { sortY: fp.sy + 0.002 });
  k.label('rally flag', fp.sx, fp.sy + 22);
  // Statuses on Drones, and a hit flash.
  const looks: (StatusLook | 'flash')[] = ['burn', 'poison', 'stun', 'slow', 'flash'];
  looks.forEach((look, i) => {
    const p = at(4 + i * 4, 21);
    const u = addRig(k, i === 3 ? 'stalker' : 'drone', p.sx, p.sy, 'side');
    u.rig.play('walk');
    if (look === 'flash') {
      k.tick((dt, t) => {
        if (Math.floor(t / 600) !== Math.floor((t - dt) / 600)) u.rig.flash(60);
      });
    } else {
      u.status = new StatusSprites(w, u.rig, u.info.bodyH, u.info.legH);
      u.status.set([look]);
    }
    k.label(look === 'flash' ? 'hit flash' : look, p.sx, p.sy + 26);
  });
  // A knight downed (unlit glow) and respawning.
  const down = addRig(k, 'warden', at(26, 21).sx, at(26, 21).sy, 'front');
  down.rig.play('down', { fadeMs: 0 });
  down.rig.setUnlit(true);
  k.label('downed', down.sx, down.sy + 26);
  const resp = addRig(k, 'ranger', at(30, 21).sx, at(30, 21).sy, 'front');
  k.tick((dt, t) => {
    if (Math.floor(t / 1500) !== Math.floor((t - dt) / 1500))
      resp.rig.play('respawn', { restart: true, fadeMs: 0 });
  });
  k.label('respawn', resp.sx, resp.sy + 26);
}

// ---- icons as world-UI badges ----------------------------------------------------------------------

function iconsPage(k: PageKit) {
  const w = k.world;
  const assets = manifest.themes['neon-knights'] as ThemeAssets;
  const icons = [...assets.icons];
  const unit = 0.8; // badge: the 52-unit tile at ~42 px
  const states = ['rest', 'active', 'dimmed'] as const;
  const perRow = 21;
  states.forEach((st, si) => {
    const top = 130 + si * 300;
    k.label(st, 60, top - 30, 18);
    icons.forEach((id, i) => {
      const sx = 90 + (i % perRow) * 84;
      const sy = top + Math.floor(i / perRow) * 84;
      const tile = w.lib.image(
        iconFrame(st === 'active' ? 'badge-tile-active' : 'badge-tile'),
        [26, 26],
      );
      w.lib.setUnitScale(tile, unit);
      tile.img.setPosition(sx, sy);
      w.layers.worldUi.add(tile.img);
      // The glyph sits at 1.6× inside the tile (icons/README.md).
      const glyph = w.lib.image(iconFrame(id as IconKey), [12, 12]);
      w.lib.setUnitScale(glyph, unit * 1.6);
      glyph.img.setPosition(sx, sy).setAlpha(st === 'dimmed' ? 0.35 : 1);
      w.layers.worldUi.add(glyph.img);
      if (si === 0) k.label(id, sx, sy + 30, 9);
    });
  });
}

// ---- map --------------------------------------------------------------------------------------------

function mapPage(k: PageKit) {
  const w = k.world;
  const map = new MapView(w, w.theme.map);
  for (const l of LANE_IDS) map.setLane(l, k.state.lanes[l]);
  const c = new Citadel(w, 18, 2);
  c.setLoadout(false, false, true);
  k.tick((dt) => c.update(dt));
  frameAt(w, fk('armory/pad'), 'ground', 22.5, 1.5);
  frameAt(w, fk('armory/kiosk'), 'world', 22.5, 1.5);
  const t = new PulseTurret(w, 14.5, 8.5);
  t.setTier(1);
  const walls = new WallField(w);
  walls.set(
    [
      [20, 8],
      [21, 8],
      [22, 8],
      [22, 9],
    ].map(([c2, r]) => ({ c: c2!, r: r! })),
  );
  const a = w.camera.worldToScreen(18, 6);
  addRig(k, 'warden', a.sx - 60, a.sy, 'front');
  addRig(k, 'ranger', a.sx + 60, a.sy, 'side');
  const d = w.camera.worldToScreen(18, 20);
  addRig(k, 'drone', d.sx, d.sy, 'side').rig.play('walk');
  for (const l of LANE_IDS) {
    const p = w.camera.worldToScreen(
      l === 'bottom' ? 18 : l === 'left' ? 2.5 : 33.5,
      l === 'bottom' ? 22 : 12,
    );
    k.label(`${l}: ${k.state.lanes[l]}`, p.sx, p.sy);
  }
}

export const PAGE_BUILDERS: Record<PageId, (k: PageKit) => void> = {
  rigs: rigsPage,
  turrets: turretsPage,
  citadel: citadelPage,
  autotiles: autotilesPage,
  effects: effectsPage,
  icons: iconsPage,
  map: mapPage,
};
