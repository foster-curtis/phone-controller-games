// The support classes on the TV (SPEC §2.4; BUILD_PLAN FF9, RD9), driven by WorldView: the Artificer's
// backpack gauge, nanite cloud, nanite cone and Field Medic circle (faint amber dots, never filled);
// the Commander's banner on his back while the flag isn't out (the flag itself is a build view,
// scene/builds/rallyFlag.ts), the shield bash's sparks at the `shield` point (the slash trail only
// while the optional `sword` group is on), Warcry's flash (amber parts and a soft aura on the knights
// it reached) and the "×2" of a Rally Cry double spawn (commanderFx.ts); footmen (march, stab, thrown
// in an arc, collapse into scrap); heal glints. Ring-adjacent marks stay unlike the super-ready pulse
// (a stroked amber ring): the aura is a soft fill, the Field Medic circle dots. Reads the sim, never
// writes.
import type * as Phaser from 'phaser';
import type { Content } from '../../content';
import { theme } from '../../shared/theme';
import { pickFacing, type Facing } from '../render/aim';
import { flightProgress, throwHeight } from '../render/buildLook';
import { TILE_W } from '../render/camera';
import { BASH_IMPACT_MS, SLASH_CUT } from '../render/clips/commander';
import { clipLandedMs } from '../render/fall';
import { GAUGE_GROUPS, gaugeGroups, gaugeSteps } from '../render/gauge';
import { RIG_INFO, type RigInfo } from '../render/gallery/rigInfo';
import type { RigSprite } from '../render/rig';
import type { RenderWorld } from '../render/world';
import { fieldMedicRadius } from '../sim';
import type { EntityId, PlayerEnt, SimEvent, SoldierEnt, World } from '../sim/types';
import { DoublePops, thrownCenter } from './commanderFx';
import { dottedAngles, moraleAlpha, Scratch, SUPER_FLASH, warcryFlashOn } from './support';
import type { FrameInput } from './worldView';

/** What SupportView needs of a knight WorldView draws. */
export interface KnightRef {
  rig: RigSprite;
  info: RigInfo;
  sx: number;
  sy: number;
  down: unknown;
}

interface Soldier {
  rig: RigSprite;
  facing: Facing | null;
  sx: number;
  sy: number;
  dying: { t: number; landed: number; piled: boolean } | null;
}

/** A knight Warcry reached: how far into its flash he is. */
interface WarcryFlash {
  t: number;
  totalMs: number;
}

interface Swipe {
  kind: 'cone' | 'slash';
  x: number;
  y: number;
  angle: number;
  half: number;
  range: number;
  age: number;
  delay: number;
  ttl: number;
}

const SNAP_TILES = 2;
const MOTE_EVERY_MS = 380;
const CONE_MS = 520;
const SLASH_TRAIL_MS = 220;
const FIELD_DOTS = 28;

const playing = (rig: RigSprite) =>
  rig.clip !== null && rig.clip !== 'idle' && rig.clip !== 'walk' && !rig.clipDone;

export class SupportView {
  /** Made on first use and cleared only after drawing (no per-frame cost for other classes). */
  private readonly ground: Scratch<Phaser.GameObjects.Graphics>;
  private readonly lines: Scratch<Phaser.GameObjects.Graphics>;
  private readonly soldiers = new Map<EntityId, Soldier>();
  private readonly gauges = new Map<number, number>();
  private readonly banners = new Map<number, boolean>();
  private readonly motes = new Map<number, number>();
  /** Warcry's flash on the knights it reached, by entity id. */
  private readonly flashes = new Map<EntityId, WarcryFlash>();
  /** Shield bashes waiting for their clip's impact: sparks at the `shield` point then. */
  private bashes: { at: number; k: KnightRef }[] = [];
  private readonly pops: DoublePops;
  private swipes: Swipe[] = [];
  private t = 0;
  private readonly footInfo = RIG_INFO.footman!;

  constructor(
    private readonly w: RenderWorld,
    private readonly content: Content,
    private readonly knight: (slot: number) => KnightRef | null,
  ) {
    this.pops = new DoublePops(w);
    this.ground = new Scratch(() => {
      const g = w.scene.make.graphics({}, false).setDepth(-4e5);
      w.layers.groundOverlay.add(g);
      return g;
    });
    this.lines = new Scratch(() => {
      const g = w.scene.make.graphics({}, false);
      w.layers.effects.add(g);
      return g;
    });
  }

  private def(p: PlayerEnt) {
    return this.content.knights.find((c) => c.id === p.classId);
  }

  private knightOf(w: World, id: EntityId): { p: PlayerEnt; k: KnightRef } | null {
    const p = w.players.find((x) => x.id === id);
    const k = p ? this.knight(p.slot) : null;
    return p && k ? { p, k } : null;
  }

  // ---- events -------------------------------------------------------------------------------------

  /** Events WorldView doesn't draw (soldiers, heals, flags). */
  event(e: SimEvent, w: World) {
    const fx = this.w.fx;
    switch (e.e) {
      case 'attack': {
        const s = this.soldiers.get(e.source);
        if (s && !s.dying) {
          s.facing = pickFacing(Math.cos(e.angle), Math.sin(e.angle), s.facing);
          s.rig.setView(s.facing.view, s.facing.mirror);
          s.rig.play('attack', { restart: true, fadeMs: 30 });
        }
        return;
      }
      case 'heal': {
        const hit = this.knightOf(w, e.target);
        if (hit && !hit.k.down)
          fx.bodyBurst('heal-glint', hit.k.sx, hit.k.sy, hit.k.info.bodyH * this.w.unitPx);
        return;
      }
      case 'death': {
        if (e.what !== 'soldier') return;
        const s = this.soldiers.get(e.id);
        if (!s) return;
        const clips = this.w.theme.clips;
        const clip = clips[`footman/death@${s.rig.view}`] ?? clips['footman/death'];
        s.rig.play('death', { restart: true, fadeMs: 0 });
        s.rig.setUnlit(true);
        s.rig.flash(60);
        s.dying = { t: 0, landed: clip ? clipLandedMs(clip) : 500, piled: false };
        return;
      }
      case 'flag':
      case 'recall': {
        const k = this.knight(e.slot);
        if (k && !k.down) k.rig.play('plant', { restart: true, fadeMs: 40 });
        return;
      }
      case 'buildPlaced': {
        // The Artificer's throw: a puff of nanites at the pack it leaves from (§2.4).
        if (e.kind !== 'beacon') return;
        const k = this.knight(e.slot);
        if (!k || k.down) return;
        k.rig.play('throw', { restart: true, fadeMs: 40 });
        const pack = k.rig.attach('pack');
        if (pack) fx.burst('nanite-mote', pack.sx, pack.sy);
        return;
      }
      case 'buildLanded': {
        const b = w.builds.find((x) => x.id === e.build);
        if (b?.kind === 'rally_flag') fx.ring('ours', b.x, b.y, b.r + 0.5, 420);
        return;
      }
      case 'reinforce': {
        if (e.count < 2) return;
        const at = thrownCenter(w, e.slot);
        if (!at) return;
        const s = this.w.camera.worldToScreen(at.x, at.y);
        this.pops.show(s.sx, s.sy);
        return;
      }
      case 'warcry':
        for (const id of e.targets) this.flashes.set(id, { t: 0, totalMs: e.durationMs });
        return;
      default:
        return;
    }
  }

  /** A support knight's own attack (WorldView has turned him to face it); false = not ours. */
  attack(e: Extract<SimEvent, { e: 'attack' }>, p: PlayerEnt, k: KnightRef): boolean {
    if (p.classId !== 'artificer' && p.classId !== 'commander') return false;
    const def = this.def(p);
    const fx = this.w.fx;
    k.rig.play(e.slot === 'super' ? 'super' : 'attack', { restart: true, fadeMs: 40 });
    if (!def) return true;
    const a = e.slot === 'super' ? def.super : def.main;
    const sweep = (kind: Swipe['kind'], delay: number, ttl: number) =>
      this.swipes.push({
        kind,
        x: e.x,
        y: e.y,
        angle: e.angle,
        half: (((a.arcDeg ?? 90) / 2) * Math.PI) / 180,
        range: a.range,
        age: 0,
        delay,
        ttl,
      });
    if (p.classId === 'artificer') {
      // The blast's muzzle flashes come one per nanite (WorldView's `drawProjectiles`).
      if (e.slot === 'super') {
        const lens = k.rig.attach('lens');
        if (lens)
          fx.burst(
            'muzzle-ours',
            lens.sx,
            lens.sy,
            Math.atan2(Math.sin(e.angle) * 0.6, Math.cos(e.angle)),
          );
        // The wide cone.
        sweep('cone', 0, CONE_MS);
        for (const g of [0.35, 0.6, 0.85]) {
          const s = this.w.camera.worldToScreen(
            e.x + Math.cos(e.angle) * a.range * g,
            e.y + Math.sin(e.angle) * a.range * g,
          );
          fx.bodyBurst('nanite-mote', s.sx, s.sy, 60);
        }
      }
      return true;
    }
    if (e.slot === 'main') {
      // The bash's sparks land on the clip's impact; the slash trail needs the drawn sword (art README).
      this.bashes.push({ at: this.t + BASH_IMPACT_MS, k });
      if (k.rig.isGroupOn('sword'))
        sweep('slash', SLASH_CUT[0], SLASH_CUT[1] - SLASH_CUT[0] + SLASH_TRAIL_MS);
    }
    return true;
  }

  // ---- per frame ----------------------------------------------------------------------------------

  update(f: FrameInput) {
    this.t += f.dtMs;
    const w = f.world;
    this.ground.begin();
    this.lines.begin();
    this.syncSoldiers(w, f);
    for (const p of w.players) {
      const k = this.knight(p.slot);
      if (!k) continue;
      if (p.classId === 'artificer') this.drawArtificer(w, p, k);
      else if (p.classId === 'commander') this.drawCommander(p, k);
      this.drawWarcry(p, k, f.dtMs);
    }
    this.landBashes();
    this.pops.update(f.dtMs);
    this.drawSwipes(f.dtMs);
  }

  /** Impact sparks at the shield boss when the bash clip lands. */
  private landBashes() {
    if (this.bashes.length === 0) return;
    const keep: typeof this.bashes = [];
    for (const b of this.bashes) {
      if (this.t < b.at) {
        keep.push(b);
        continue;
      }
      const at = b.k.down ? null : b.k.rig.attach('shield');
      if (at) this.w.fx.burst('spark-ours', at.sx, at.sy);
    }
    this.bashes = keep;
  }

  private screen(id: EntityId, x: number, y: number, f: FrameInput) {
    const p = f.prev.get(id);
    let px = x;
    let py = y;
    if (p && Math.abs(p.x - x) + Math.abs(p.y - y) < SNAP_TILES) {
      px = p.x + (x - p.x) * f.alpha;
      py = p.y + (y - p.y) * f.alpha;
    }
    return { x: px, y: py, ...this.w.camera.worldToScreen(px, py) };
  }

  private drawArtificer(w: World, p: PlayerEnt, k: KnightRef) {
    // Backpack gauge shows the build meter (0..1), bottom cell first (render/gauge.ts).
    const cores = gaugeSteps(p.meter);
    if (this.gauges.get(p.slot) !== cores) {
      this.gauges.set(p.slot, cores);
      const on = new Set(gaugeGroups(cores));
      for (const g of GAUGE_GROUPS)
        if (k.rig.isGroupOn(g) !== on.has(g)) k.rig.setGroup(g, on.has(g));
    }
    if (k.down || !p.connected) return;
    // The drifting nanite cloud at the projector.
    const next = this.motes.get(p.slot) ?? 0;
    if (this.t >= next) {
      this.motes.set(p.slot, this.t + MOTE_EVERY_MS);
      const lens = k.rig.attach('lens');
      if (lens) {
        const n = Math.floor(this.t / MOTE_EVERY_MS);
        const jx = ((n * 37) % 11) - 5;
        const jy = ((n * 53) % 9) - 4;
        this.w.fx.burst('nanite-mote', lens.sx + jx, lens.sy + jy);
      }
    }
    // Field Medic (his card, combat only): a faint dotted amber ground circle, never filled.
    const r = w.phase === 'combat' ? fieldMedicRadius(p, this.content) : null;
    if (r !== null) {
      const { rx, ry } = this.w.camera.groundEllipse(r);
      const g = this.ground.draw();
      g.fillStyle(theme.color.amber.num, 0.35);
      for (const a of dottedAngles(FIELD_DOTS, this.t))
        g.fillCircle(k.sx + Math.cos(a) * rx, k.sy + Math.sin(a) * ry, 2.2);
    }
  }

  private drawCommander(p: PlayerEnt, k: KnightRef) {
    // The banner rides on his back while the flag isn't out (§2.4).
    const banner = p.flag === null;
    if (this.banners.get(p.slot) !== banner) {
      this.banners.set(p.slot, banner);
      k.rig.setGroup('banner', banner);
    }
  }

  /**
   * Warcry's flash on a knight it reached: his amber parts and the aura under him flash on and off
   * for its duration; between flashes the aura fades. Normal again once it ends.
   */
  private drawWarcry(p: PlayerEnt, k: KnightRef, dtMs: number) {
    const fl = this.flashes.get(p.id);
    if (!fl) return;
    fl.t += dtMs;
    if (k.down || fl.t >= fl.totalMs) {
      this.flashes.delete(p.id);
      k.rig.setGlow(1);
      return;
    }
    const on = warcryFlashOn(fl.t, fl.totalMs);
    k.rig.setGlow(on ? SUPER_FLASH.glow : 1);
    const a = on ? SUPER_FLASH.auraAlpha : moraleAlpha(fl.totalMs - fl.t, fl.totalMs);
    if (a > 0) this.aura(k.sx, k.sy, 0.75, a);
  }

  /** A soft amber glow on the ground (no stroke, so never read as the super-ready ring). */
  private aura(sx: number, sy: number, rTiles: number, alpha: number) {
    const { rx, ry } = this.w.camera.groundEllipse(rTiles);
    const g = this.ground.draw();
    g.fillStyle(theme.color.amber.num, alpha * 0.5).fillEllipse(sx, sy, rx * 2.4, ry * 2.4);
    g.fillStyle(theme.color.amber.num, alpha).fillEllipse(sx, sy, rx * 1.6, ry * 1.6);
  }

  private syncSoldiers(w: World, f: FrameInput) {
    const live = new Map<EntityId, SoldierEnt>();
    for (const u of w.soldiers) live.set(u.id, u);
    for (const u of w.soldiers) {
      if (this.soldiers.has(u.id) || u.hp <= 0) continue;
      const owner = w.players.find((p) => p.slot === u.owner);
      const rig = this.w.rig(this.w.theme.rigFor.soldier, {
        view: 'front',
        tint: owner ? theme.players[owner.color].fill.num : undefined,
        clip: 'idle',
      });
      rig.play('idle', { offsetMs: (u.id * 131) % 900, fadeMs: 0 });
      this.soldiers.set(u.id, { rig, facing: null, sx: 0, sy: 0, dying: null });
    }
    for (const [id, s] of this.soldiers) {
      const u = live.get(id);
      if (s.dying) {
        s.dying.t += f.dtMs;
        if (!s.dying.piled && s.dying.t >= s.dying.landed) {
          s.dying.piled = true;
          this.w.fx.scrap('ours', id % 2 === 0 ? 1 : 2, s.sx, s.sy);
        }
        if (s.rig.clipDone) {
          s.rig.destroy();
          this.soldiers.delete(id);
        }
        continue;
      }
      if (!u) {
        s.rig.destroy();
        this.soldiers.delete(id);
        continue;
      }
      const at = this.screen(id, u.x, u.y, f);
      s.sx = at.sx;
      s.sy = at.sy;
      const sh = this.footInfo.shadow;
      // Thrown by Reinforcements: tucked, arcing over its shadow until it lands (§2.4).
      if (u.flight) {
        const fl = u.flight;
        const k = flightProgress(w.tick - 1 + f.alpha, fl.launchedAt, fl.landsAt);
        const fx = fl.from.x + (fl.to.x - fl.from.x) * k;
        const fy = fl.from.y + (fl.to.y - fl.from.y) * k;
        const g = this.w.camera.worldToScreen(fx, fy);
        const z = throwHeight(k, Math.hypot(fl.to.x - fl.from.x, fl.to.y - fl.from.y));
        s.sx = g.sx;
        s.sy = g.sy;
        s.rig.setPosition(g.sx, g.sy - z * TILE_W * this.w.camera.scale, g.sy);
        if (s.rig.clip !== 'thrown') s.rig.play('thrown', { restart: true, fadeMs: 0 });
        this.w.marks.shadow(g.sx, g.sy, sh[0] * 2, sh[1] * 2);
        continue;
      }
      s.rig.setPosition(at.sx, at.sy);
      if (s.rig.clip === 'thrown') s.rig.play('idle', { fadeMs: 60 });
      const moving = Math.hypot(u.vx, u.vy) > 0.05;
      if (moving || !s.facing) {
        const dir = moving
          ? { x: u.vx, y: u.vy }
          : { x: Math.cos(u.facing), y: Math.sin(u.facing) };
        s.facing = pickFacing(dir.x, dir.y, s.facing);
        s.rig.setView(s.facing.view, s.facing.mirror);
      }
      if (!playing(s.rig)) s.rig.play(moving ? 'walk' : 'idle');
      this.w.marks.shadow(at.sx, at.sy, sh[0] * 2, sh[1] * 2);
    }
  }

  /** The nanite cone (filled, fading) and the sword trail sweeping the hit arc. */
  private drawSwipes(dtMs: number) {
    const cam = this.w.camera;
    const keep: Swipe[] = [];
    for (const sw of this.swipes) {
      sw.age += dtMs;
      const t = sw.age - sw.delay;
      if (t > sw.ttl) continue;
      keep.push(sw);
      if (t < 0) continue;
      const g = this.lines.draw();
      const u = t / sw.ttl;
      const N = 18;
      const pt = (a: number, r: number) =>
        cam.worldToScreen(sw.x + Math.cos(a) * r, sw.y + Math.sin(a) * r);
      if (sw.kind === 'cone') {
        const r = sw.range * Math.min(1, 0.35 + u * 1.6);
        const o = cam.worldToScreen(sw.x, sw.y);
        const pts = [{ x: o.sx, y: o.sy }] as unknown as Phaser.Math.Vector2[];
        for (let i = 0; i <= N; i++) {
          const p = pt(sw.angle - sw.half + (2 * sw.half * i) / N, r);
          pts.push({ x: p.sx, y: p.sy } as Phaser.Math.Vector2);
        }
        g.fillStyle(theme.color.amber.num, 0.22 * (1 - u)).fillPoints(pts, true);
        g.lineStyle(2, theme.color.amber.num, 0.6 * (1 - u)).strokePoints(pts, true);
        continue;
      }
      // Slash: the edge sweeps from one side of the arc to the other, its trail fading behind.
      const cutMs = SLASH_CUT[1] - SLASH_CUT[0];
      const sweep = Math.min(1, t / cutMs);
      const fade = t > cutMs ? 1 - (t - cutMs) / SLASH_TRAIL_MS : 1;
      const a0 = sw.angle - sw.half;
      const steps = Math.max(2, Math.round(N * sweep));
      for (let i = 0; i < steps; i++) {
        const p0 = pt(a0 + (2 * sw.half * sweep * i) / steps, sw.range);
        const p1 = pt(a0 + (2 * sw.half * sweep * (i + 1)) / steps, sw.range);
        const lead = (i + 1) / steps;
        g.lineStyle(4, theme.color.amber.num, 0.85 * fade * (0.3 + 0.7 * lead));
        g.lineBetween(p0.sx, p0.sy, p1.sx, p1.sy);
      }
    }
    this.swipes = keep;
  }

  destroy() {
    for (const s of this.soldiers.values()) s.rig.destroy();
    this.soldiers.clear();
    this.flashes.clear();
    this.bashes = [];
    this.pops.destroy();
    this.ground.destroy();
    this.lines.destroy();
  }
}
