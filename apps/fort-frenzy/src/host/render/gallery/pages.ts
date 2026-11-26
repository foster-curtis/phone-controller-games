// Gallery pages (BUILD_PLAN FF3; RD12): every rig × view × pose × clip, the Citadel at each stage with
// sentries, the builds in every state and the portals (buildsPage.ts), effects and statuses, every
// icon as a world-UI badge, and the map with its six portals flaring in turn.
import { manifest } from '../../../../generated/manifest';
import { theme } from '../../../shared/theme';
import { ART_SET, type ArtSetAssets, type ViewId } from '../../../presentation/types';
import { placeFrame } from '../context';
import { fk, iconFrame, MARK_FRAMES, scrapFrame, sentryFrame } from '../keys';
import { MapView, PORTALS } from '../map';
import type { RigSprite } from '../rig';
import { drawBowString } from '../bowString';
import { CITADEL_COLLAPSE_MS } from '../citadelFx';
import { RELEASE_MS } from '../clips/ranger';
import { SLAM_IMPACT_MS, STOMP_IMPACT_MS } from '../clips/warden';
import { content } from '../../../content';
import { KNIGHT_DOWN } from '../clipKit';
import { PROJECTILE_SPEEDS } from '../effectsMath';
import { clipLandedMs, spawnPile } from '../fall';
import { locomotionSpeed, StatusSprites } from '../status';
import { mitePack, mitePose } from '../swarm';
import { Citadel } from '../structures';
import {
  SENTRY_AIMS,
  SENTRY_LOADOUTS,
  type BurstKind,
  type IconKey,
  type MarkKind,
  type ProjectileKind,
  type StatusLook,
} from '../types';
import type { RenderWorld } from '../world';
import { RIG_INFO, type RigInfo } from './rigInfo';
import { buildsPage, portalsPage } from './buildsPage';
import { colossusPage } from './colossusPage';
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

/** One-shot clips replayed on a loop: period, ms. */
const ONE_SHOTS: Partial<Record<string, number>> = {
  hit: 1600,
  respawn: 2000,
  attack: 1200,
  // The Warden's jump slam is 1.35 s long; the loop holds 400 ms after it (RD3-fix-2).
  super: 1750,
  build: 1600,
  slam: 2600,
  throw: 1900,
  call: 1800,
  stagger: 3400,
};

/** World tiles under a screen point (the fixed camera's inverse; ground only). */
function worldAt(k: PageKit, sx: number, sy: number): [number, number] {
  const o = k.world.camera.worldToScreen(0, 0);
  const one = k.world.camera.worldToScreen(1, 1);
  return [(sx - o.sx) / (one.sx - o.sx), (sy - o.sy) / (one.sy - o.sy)];
}

function addRig(
  k: PageKit,
  rigId: string,
  sx: number,
  sy: number,
  view: ViewId,
  pose?: string,
  /** Clip to show (default: the page control); fixed demos pass their own. */
  clipName = k.state.clip,
): Unit {
  const s = k.state;
  const groups: string[] = [];
  if (rigId === 'commander' && s.banner) groups.push('banner');
  if (rigId === 'commander' && s.sword) groups.push('sword');
  if (rigId === 'warden' && s.slam) groups.push('slam');
  if (rigId === 'artificer') groups.push(...gaugeGroups(s.gauge));
  if (rigId === 'colossus') groups.push(...colossusGroups(s.colossus));
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
  const clip = clipName;
  if (!rig.play(clip, { fadeMs: 0 })) rig.play('idle', { fadeMs: 0 });
  else if (clip === 'down') downCycle(k, rig, sx, sy);
  else if (clip === 'death') deathCycle(k, rig, sx, sy);
  else if (ONE_SHOTS[clip] !== undefined) {
    const period = ONE_SHOTS[clip];
    // The Ranger shoots and pulses from his `ready` pose (FF7 wiring snaps to it for the shot).
    if (rigId === 'ranger' && (clip === 'attack' || clip === 'super') && !pose)
      rig.setPose('ready', 0);
    k.tick((_dt, t) => {
      if (Math.floor(t / period) !== Math.floor((t - _dt) / period)) {
        rig.play(clip, { restart: true, fadeMs: 0 });
        if (clip === 'hit') rig.flash(60);
        if (clip === 'super' && rigId !== 'warden')
          k.world.fx.ring('ours', ...worldAt(k, sx, sy), 3);
      }
    });
    if (clip === 'attack' && rigId === 'ranger') {
      // Draw, hold, release: the flash leaves the bow on the release, and the slack string is drawn
      // by code while the art string is dark (C2).
      every(k, period, RELEASE_MS, () => {
        const m = rig.attach('bolt');
        if (m) k.world.fx.burst('muzzle-ours', m.sx, m.sy, rig.mirrored ? Math.PI : 0, 40);
      });
      k.tick(() => drawBowString(rig));
    }
    if (rigId === 'warden' && (clip === 'attack' || clip === 'super'))
      wardenWaves(k, rig, sx, sy, clip);
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

/**
 * The Warden's slam or stomp (FF8): on each replay's impact frame, the shockwave across the content's
 * hit arc and sparks at the hammer head.
 */
function wardenWaves(k: PageKit, rig: RigSprite, sx: number, sy: number, clip: 'attack' | 'super') {
  const def = content.knights.find((c) => c.id === 'warden')!;
  const a = clip === 'attack' ? def.main : def.super;
  const angle =
    rig.view === 'side'
      ? rig.mirrored
        ? Math.PI
        : 0
      : rig.view === 'front'
        ? Math.PI / 2
        : -Math.PI / 2;
  const [x, y] = worldAt(k, sx, sy);
  every(k, ONE_SHOTS[clip]!, clip === 'attack' ? SLAM_IMPACT_MS : STOMP_IMPACT_MS, () => {
    k.world.fx.arcWave?.('ours', x, y, a.range, angle, a.arcDeg ?? 90);
    const h = rig.attach('hammer');
    if (h && clip === 'attack') k.world.fx.burst('spark-ours', h.sx, h.sy);
  });
}

/** Runs `fn` once each time t passes `at` within a `period` loop. */
function every(k: PageKit, period: number, at: number, fn: () => void) {
  k.tick((dt, t) => {
    const a = (t - dt) % period;
    const b = t % period;
    if ((a < at && b >= at) || (b < a && (a < at || b >= at))) fn();
  });
}

/**
 * A knight going down and back (C1 note 4): dims, falls into a pile of armor with scrap that lasts
 * the (sample) down timer, then respawns.
 */
function downCycle(k: PageKit, rig: RigSprite, sx: number, sy: number) {
  const clips = k.world.theme.clips;
  const down = (clips[`${rig.rigId}/down@${rig.view}`] ?? clips[`${rig.rigId}/down`])!;
  const respawnAt = 3800;
  const period = respawnAt + (rig.clipMs('respawn') ?? 1100) + 600;
  const start = () => {
    rig.setUnlit(k.state.unlit);
    rig.play('down', { restart: true, fadeMs: 0 });
  };
  start();
  every(k, period, 0.001, start);
  every(k, period, KNIGHT_DOWN.dimMs, () => rig.setUnlit(true));
  const landed = clipLandedMs(down);
  const pile = () =>
    spawnPile(k.world.fx, 'ours', sx, sy, k.world.unitPx, {
      holdMs: respawnAt - landed,
      seed: rig.rigId,
    });
  every(k, period, landed, pile);
  every(k, period, respawnAt, () => {
    rig.setUnlit(k.state.unlit);
    rig.play('respawn', { restart: true, fadeMs: 0 });
  });
}

const BIG_SCRAP = new Set(['brute', 'bombard', 'colossus']);

/** An enemy dying (C1 note 4): glow out, collapse into a pile, `scrap-theirs`, fade; then again. */
function deathCycle(k: PageKit, rig: RigSprite, sx: number, sy: number) {
  const death = k.world.theme.clips[`${rig.rigId}/death`]!;
  const period = death.durationMs + 700;
  const start = () => {
    rig.play('death', { restart: true, fadeMs: 0 });
    rig.setUnlit(true);
    rig.flash(60);
  };
  start();
  every(k, period, 0.001, start);
  every(k, period, clipLandedMs(death), () =>
    spawnPile(k.world.fx, 'theirs', sx, sy, k.world.unitPx, {
      big: BIG_SCRAP.has(rig.rigId),
      holdMs: death.durationMs - clipLandedMs(death),
      seed: rig.rigId,
    }),
  );
}

/**
 * A pack of 8 Scrap mites (§9.6, C1 note 3): mixed sizes and tilts, every mite on its own jittery
 * path with stops (render/swarm.ts) while the clip is `walk`; each sorts by its own foot point, so
 * the pack re-layers as mites pass each other. Other clips play on every mite in place.
 */
function mitePackAt(k: PageKit, cx: number, cy: number) {
  const tile = 48;
  const walking = k.state.clip === 'walk';
  mitePack(7).forEach((m, i) => {
    const p0 = mitePose(m, 0);
    const u = addRig(k, 'mite', cx + p0.dx * tile, cy + p0.dy * tile * 0.6, 'side');
    u.rig.root.setScale(u.rig.root.scaleX * m.scale, u.rig.root.scaleY * m.scale);
    if (!walking) return;
    u.rig.play('walk', { offsetMs: m.offsetMs, speed: m.speed, fadeMs: 0 });
    k.tick((_dt, t) => {
      const p = mitePose(m, t + i * 97);
      u.sx = cx + p.dx * tile;
      u.sy = cy + p.dy * tile * 0.6;
      u.rig.setPosition(u.sx, u.sy);
      u.rig.root.setRotation(p.wobble * 0.35);
      u.rig.play(p.moving ? 'walk' : 'idle', { speed: m.speed, fadeMs: 60 });
    });
  });
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
  const enemies = ['drone', 'skitter', 'brute', 'bombard', 'wasp', 'mite', 'stalker', 'colossus'];
  enemies.forEach((rig, i) => {
    if (rig === 'mite') mitePackAt(k, colX(i), rowC - 10);
    else addRig(k, rig, colX(i), rowC, 'side');
    k.label(
      rig === 'colossus'
        ? `colossus mk${k.state.colossus === 4 ? ' final' : k.state.colossus}`
        : rig,
      colX(i),
      rowC + 34,
    );
  });
}

// ---- Citadel + sentries ----------------------------------------------------------------------------

function citadelPage(k: PageKit) {
  const w = k.world;
  const xs = [3, 8.8, 14.6, 20.4, 26.2, 32];
  const loadouts: [boolean, boolean, boolean][] = [
    [false, false, true],
    [true, false, false],
    [false, true, true],
    [true, true, true],
    [false, false, false],
    [true, false, true],
  ];
  xs.forEach((x, i) => {
    const c = new Citadel(w, x, 8);
    if (i < 4) c.setStage(i as 0 | 1 | 2 | 3);
    else if (i === 4) c.setDestroyed(true);
    else {
      // The destroyed transition on a loop (C1 note 8): standing at the smoke stage, collapse,
      // rubble, back up.
      c.setStage(3);
      const period = 1200 + CITADEL_COLLAPSE_MS + 1800;
      every(k, period, 1200, () => c.collapse(w.fx));
      every(k, period, period - 1, () => c.setDestroyed(false));
    }
    const [d, r, third] = loadouts[i]!;
    c.setLoadout(d, r, third);
    k.label(
      i < 4
        ? ['stage 0', 'cracks (66%)', '+ fire (33%)', '+ smoke (10%)'][i]!
        : i === 4
          ? 'destroyed'
          : 'collapse → destroyed',
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

// ---- effects + statuses ----------------------------------------------------------------------------

function effectsPage(k: PageKit) {
  const w = k.world;
  const at = (x: number, y: number) => w.camera.worldToScreen(x, y);
  // Projectiles at a few headings (static) and in flight (arcs sort by their shadow).
  const kinds: ProjectileKind[] = ['bolt', 'nanite-bolt', 'bombard-shell', 'boulder', 'wasp-shot'];
  kinds.forEach((kind, i) => {
    const pr = w.fx.projectile(kind);
    pr.set(2.5 + i * 2.5, 3, 0, -0.5);
    const p = at(2.5 + i * 2.5, 3);
    k.label(kind, p.sx, p.sy + 22);
    if (kind in PROJECTILE_SPEEDS) return;
    // Arcs in their slot.
    const fly = w.fx.projectile(kind);
    k.tick((_dt, t) => {
      const u = (t / 1600 + i * 0.13) % 1;
      fly.set(2 + i * 2.5 + u * 2, 8.2, Math.sin(u * Math.PI) * 1.5, 0);
    });
  });
  // Straight shots at their game speeds (C1 note 9), down a long lane so the speed reads.
  (Object.entries(PROJECTILE_SPEEDS) as [ProjectileKind, number][]).forEach(([kind, tps], j) => {
    const y = 4.9 + j * 0.55;
    const from = 4;
    const to = 19;
    const fly = w.fx.projectile(kind);
    const p = at(from - 1.6, y);
    k.label(`${kind} ${tps} t/s`, p.sx, p.sy - 8, 10);
    const lap = ((to - from) / tps) * 1000 + 350;
    k.tick((_dt, t) => {
      const s = ((t + j * 200) % lap) / 1000;
      const x = from + s * tps;
      // Past the lane's end it waits off-canvas for the next lap.
      fly.set(x > to ? -20 : x, y, 0, 0);
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
  // Tracers and rings.
  k.tick((dt, t) => {
    if (Math.floor(t / 300) === Math.floor((t - dt) / 300)) return;
    const a = at(21, 6.5);
    const b = at(26, 5.5);
    w.fx.tracer('ours', a, b);
    w.fx.tracer('theirs', at(21, 8), at(26, 9));
    w.fx.ring('ours', 29, 7.5, 1.2);
    w.fx.ring('theirs', 32, 7.5, 1.2);
    w.fx.ring('danger', 29, 10.5, 1.2);
  });
  // Scrap: ours and theirs, 1–5.
  (['ours', 'theirs'] as const).forEach((side, row) => {
    for (let s = 1; s <= 5; s++) {
      const p = at(2.5 + (s - 1) * 2.5 + row * 13, 10);
      placeFrame(w, scrapFrame(side, s), 'world', p.sx, p.sy);
      k.label(`scrap-${side}-${s}`, p.sx, p.sy + 20);
    }
  });
  // The redesign's marks (slam cracks, landing dust, portal sparks, Ranger super and mine, Brute and
  // Charge tells), dropped on a loop; the builds' own effects are on the builds page.
  (Object.keys(MARK_FRAMES) as MarkKind[]).forEach((kind, i) => {
    const p = at(2 + i * 1.9, 14);
    k.label(kind, p.sx, p.sy + 36, 10);
    k.tick((dt, t) => {
      if (Math.floor(t / 1500) !== Math.floor((t - dt) / 1500)) w.fx.mark?.(kind, p.sx, p.sy, 1300);
    });
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
  // Statuses on walking Drones (a Stalker for slow), and a hit flash. A stunned unit idles even
  // while it would be walking (C1 note 11); a slowed one walks sluggishly under flickering arcs.
  const looks: (StatusLook | 'flash')[] = ['burn', 'poison', 'stun', 'slow', 'flash'];
  looks.forEach((look, i) => {
    const p = at(4 + i * 4, 21);
    const u = addRig(k, i === 3 ? 'stalker' : 'drone', p.sx, p.sy, 'side', undefined, 'idle');
    if (look === 'flash') {
      u.rig.play('walk');
      k.tick((dt, t) => {
        if (Math.floor(t / 600) !== Math.floor((t - dt) / 600)) u.rig.flash(60);
      });
    } else {
      const status = new StatusSprites(w, u.rig, u.info.bodyH, u.info.legH, i);
      status.set([look]);
      u.status = status;
      // Wiring's per-frame rule: moving units walk unless stunned; slowed ones walk slower.
      k.tick(() => u.rig.play(status.locomotion(true), { speed: locomotionSpeed([look]) }));
    }
    const name = { stun: 'stun (idles)', slow: 'slow (sluggish)', flash: 'hit flash' } as const;
    k.label(name[look as keyof typeof name] ?? look, p.sx, p.sy + 26);
  });
  // A knight going down into a pile and respawning (C1 notes 4, 5), and the respawn on its own.
  const down = addRig(k, 'warden', at(26, 21).sx, at(26, 21).sy, 'front', undefined, 'idle');
  downCycle(k, down.rig, down.sx, down.sy);
  k.label('down → pile → respawn', down.sx, down.sy + 26);
  const resp = addRig(k, 'ranger', at(30, 21).sx, at(30, 21).sy, 'front', undefined, 'idle');
  k.tick((dt, t) => {
    if (Math.floor(t / 2000) !== Math.floor((t - dt) / 2000))
      resp.rig.play('respawn', { restart: true, fadeMs: 0 });
  });
  k.label('respawn', resp.sx, resp.sy + 26);
  // Heal glints and nanite motes spread over a body (C1 note 10).
  (['heal-glint', 'nanite-mote'] as const).forEach((kind, i) => {
    const p = at(26 + i * 4, 15.5);
    const u = addRig(k, i === 0 ? 'commander' : 'artificer', p.sx, p.sy, 'side', undefined, 'idle');
    const h = u.info.bodyH * w.unitPx;
    k.tick((dt, t) => {
      if (Math.floor(t / 700) !== Math.floor((t - dt) / 700)) w.fx.bodyBurst(kind, p.sx, p.sy, h);
    });
    k.label(`${kind} on a body`, p.sx, p.sy + 26);
  });
  // An enemy hit and an enemy death (C1 notes 2, 4); every rig's are on the rigs page (clip).
  const hit = addRig(k, 'brute', at(33.5, 15.5).sx, at(33.5, 15.5).sy, 'side', undefined, 'idle');
  k.tick((dt, t) => {
    if (Math.floor(t / 1200) !== Math.floor((t - dt) / 1200)) {
      hit.rig.play('hit', { restart: true, fadeMs: 0 });
      hit.rig.flash(60);
    }
  });
  k.label('enemy hit', hit.sx, hit.sy + 26);
  const dies = addRig(k, 'drone', at(33.5, 21).sx, at(33.5, 21).sy, 'side', undefined, 'idle');
  deathCycle(k, dies.rig, dies.sx, dies.sy);
  k.label('enemy death', dies.sx, dies.sy + 26);
}

// ---- icons as world-UI badges ----------------------------------------------------------------------

function iconsPage(k: PageKit) {
  const w = k.world;
  const assets = manifest.sets[ART_SET] as ArtSetAssets;
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
  const c = new Citadel(w, 18, 2);
  c.setLoadout(false, false, true);
  k.tick((dt) => c.update(dt));
  // The six portals flare in turn (SPEC §3.1), on the map where the lanes used to be.
  const lap = 1800;
  k.tick((dt, t) => {
    if (Math.floor(t / lap) === Math.floor((t - dt) / lap)) return;
    const n = PORTALS.length;
    map.idle(PORTALS[(Math.floor(t / lap) + n - 1) % n]!.id);
    map.flare(PORTALS[Math.floor(t / lap) % n]!.id, lap - 200);
  });
  const a = w.camera.worldToScreen(18, 6);
  addRig(k, 'warden', a.sx - 60, a.sy, 'front');
  addRig(k, 'ranger', a.sx + 60, a.sy, 'side');
  const d = w.camera.worldToScreen(18, 20);
  addRig(k, 'drone', d.sx, d.sy, 'side').rig.play('walk');
}

export const PAGE_BUILDERS: Record<PageId, (k: PageKit) => void> = {
  rigs: rigsPage,
  citadel: citadelPage,
  builds: buildsPage,
  portals: portalsPage,
  effects: effectsPage,
  icons: iconsPage,
  map: mapPage,
  colossus: colossusPage,
};
