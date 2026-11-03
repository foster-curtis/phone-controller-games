// The support classes on the TV (SPEC §2.4; BUILD_PLAN FF9), driven by WorldView: the Artificer's
// backpack gauge, nanite cloud, nanite cone and Field Medic circle (faint amber dots, never filled),
// thrown cells lobbing from the hand to the receiver's carry point with a ground shadow; the
// Commander's banner on his back or the planted flag (tinted cloth, amber ring), slash trail along
// the exact hit arc, morale pulse and aura (a soft amber glow under him and his squad that fades as
// the buff runs out), and Lead from the Front link lines; footmen (march, stab, collapse into scrap);
// heal glints. Ring-adjacent marks stay unlike the super-ready pulse (a stroked amber ring): the
// aura is a soft fill, the Field Medic circle dots, the flag ring is art. Reads the sim, never writes.
import type * as Phaser from 'phaser';
import type { Content } from '../../content';
import { theme } from '../../shared/theme';
import type { ArtImage } from '../render/atlas';
import { pickFacing, type Facing } from '../render/aim';
import { SLASH_CUT } from '../render/clips/commander';
import { THROW_RELEASE_MS } from '../render/clips/artificer';
import { placeFrame } from '../render/context';
import { SHADOW_TEXTURE } from '../render/effects';
import { clipLandedMs } from '../render/fall';
import { GAUGE_GROUPS, gaugeGroups } from '../render/gauge';
import { RIG_INFO, type RigInfo } from '../render/gallery/rigInfo';
import { fk } from '../render/keys';
import type { RigSprite } from '../render/rig';
import type { ScreenPoint } from '../render/types';
import type { RenderWorld } from '../render/world';
import { fieldMedicRadius, inSector, type Sector } from '../sim';
import {
  STEP_MS,
  type EntityId,
  type PlayerEnt,
  type SimEvent,
  type SoldierEnt,
  type World,
} from '../sim/types';
import {
  dottedAngles,
  Scratch,
  MIN_PEAK_PX,
  moraleAlpha,
  PEAK_PX_PER_TILE,
  throwArc,
  throwProgress,
} from './support';
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

interface Flag {
  at: { x: number; y: number };
  parts: ArtImage[];
}

interface Cell {
  img: ArtImage;
  shadow: Phaser.GameObjects.Image;
  /** The hand at the release (screen), captured once. */
  from: ScreenPoint | null;
  fromFoot: ScreenPoint | null;
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
  private readonly flags = new Map<number, Flag>();
  private readonly cells = new Map<EntityId, Cell>();
  private readonly gauges = new Map<number, number>();
  private readonly banners = new Map<number, boolean>();
  private readonly motes = new Map<number, number>();
  private swipes: Swipe[] = [];
  /** Nanite cones fired since the last frame (their towers glint). */
  private glints: Sector[] = [];
  private t = 0;
  private readonly footInfo = RIG_INFO.footman!;

  constructor(
    private readonly w: RenderWorld,
    private readonly content: Content,
    private readonly knight: (slot: number) => KnightRef | null,
  ) {
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
    return this.content.characters.find((c) => c.id === p.classId);
  }

  private knightOf(w: World, id: EntityId): { p: PlayerEnt; k: KnightRef } | null {
    const p = w.players.find((x) => x.id === id);
    const k = p ? this.knight(p.slot) : null;
    return p && k ? { p, k } : null;
  }

  // ---- events -------------------------------------------------------------------------------------

  /** Events WorldView doesn't draw (soldiers, heals, flags, throws, kits). */
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
      case 'flag': {
        const k = this.knight(e.slot);
        if (k && !k.down) k.rig.play('plant', { restart: true, fadeMs: 40 });
        return;
      }
      case 'crate': {
        if (e.action !== 'throw') return;
        const k = this.knight(e.slot);
        if (k && !k.down) k.rig.play('throw', { restart: true, fadeMs: 40 });
        return;
      }
      case 'kitUsed': {
        // The emergency kit: an amber wave over the Citadel, with glints (§3.6).
        const b = w.base;
        fx.ring('ours', b.x, b.y + 0.5, 2.6, 700);
        fx.ring('ours', b.x, b.y + 0.5, 1.6, 500);
        const s = this.w.camera.worldToScreen(b.x, b.y + 1);
        fx.bodyBurst('heal-glint', s.sx, s.sy, 120);
        return;
      }
      default:
        return;
    }
  }

  /** A support knight's own attack (WorldView has turned him to face it); false = not ours. */
  attack(e: Extract<SimEvent, { e: 'attack' }>, p: PlayerEnt, k: KnightRef): boolean {
    if (p.classId !== 'quartermaster' && p.classId !== 'commander') return false;
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
    if (p.classId === 'quartermaster') {
      const lens = k.rig.attach('lens');
      if (lens)
        fx.burst(
          'muzzle-ours',
          lens.sx,
          lens.sy,
          Math.atan2(Math.sin(e.angle) * 0.6, Math.cos(e.angle)),
        );
      if (e.slot === 'super') {
        // The wide cone, drawn over walls (it passes through them); buffed towers glint.
        sweep('cone', 0, CONE_MS);
        for (const g of [0.35, 0.6, 0.85]) {
          const s = this.w.camera.worldToScreen(
            e.x + Math.cos(e.angle) * a.range * g,
            e.y + Math.sin(e.angle) * a.range * g,
          );
          fx.bodyBurst('nanite-mote', s.sx, s.sy, 60);
        }
        // The towers it reached glint at the next frame (the same geometry as the sim's cone).
        const half = (((a.arcDeg ?? 90) / 2) * Math.PI) / 180;
        this.glints.push({ x: e.x, y: e.y, angle: e.angle, half, range: a.range });
      }
      return true;
    }
    if (e.slot === 'main')
      sweep('slash', SLASH_CUT[0], SLASH_CUT[1] - SLASH_CUT[0] + SLASH_TRAIL_MS);
    else {
      // Morale: an amber pulse from him; the aura (update) fades with the buff.
      fx.ring('ours', e.x, e.y, 1.1, 520);
      fx.ring('ours', e.x, e.y, 2.2, 700);
    }
    return true;
  }

  // ---- per frame ----------------------------------------------------------------------------------

  update(f: FrameInput) {
    this.t += f.dtMs;
    const w = f.world;
    this.ground.begin();
    this.lines.begin();
    for (const sec of this.glints) {
      for (const st of w.structures) {
        if (st.kind !== 'arrow_tower' && st.kind !== 'bomb_tower') continue;
        if (!inSector(sec, st.x, st.y, st.r)) continue;
        const s = this.w.camera.worldToScreen(st.x, st.y);
        this.w.fx.bodyBurst('heal-glint', s.sx, s.sy, 70);
      }
    }
    this.glints = [];
    this.syncSoldiers(w, f);
    for (const p of w.players) {
      const k = this.knight(p.slot);
      if (!k) continue;
      if (p.classId === 'quartermaster') this.drawArtificer(w, p, k);
      else if (p.classId === 'commander') this.drawCommander(w, p, k);
    }
    this.syncFlags(w);
    this.drawCells(w, f);
    this.drawSwipes(f.dtMs);
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
    // Backpack gauge: half a cell per crate, bottom cell first (render/gauge.ts).
    if (this.gauges.get(p.slot) !== p.crates) {
      this.gauges.set(p.slot, p.crates);
      const on = new Set(gaugeGroups(p.crates));
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
    // Field Medic (combat only): a faint dotted amber ground circle, never filled.
    if (w.phase === 'combat') {
      const def = this.def(p);
      const r = fieldMedicRadius(def?.passive.params);
      const { rx, ry } = this.w.camera.groundEllipse(r);
      const g = this.ground.draw();
      g.fillStyle(theme.color.amber.num, 0.35);
      for (const a of dottedAngles(FIELD_DOTS, this.t))
        g.fillCircle(k.sx + Math.cos(a) * rx, k.sy + Math.sin(a) * ry, 2.2);
    }
  }

  private drawCommander(w: World, p: PlayerEnt, k: KnightRef) {
    // The banner rides on his back while the flag is carried (§2.4).
    const banner = p.flag === null;
    if (this.banners.get(p.slot) !== banner) {
      this.banners.set(p.slot, banner);
      k.rig.setGroup('banner', banner);
    }
    if (k.down) return;
    const color = theme.color.amber.num;
    // Morale aura: on him and his squad, fading with the buff (its timer).
    const morale = p.effects.find((e) => e.def === 'morale');
    const total = this.def(p)?.super.effects?.find((x) => x.effect === 'morale')?.durationMs ?? 0;
    const a = morale ? moraleAlpha(morale.remaining * STEP_MS, total) : 0;
    if (a > 0) {
      this.aura(k.sx, k.sy, 0.75, a);
      k.rig.setGlow(1 + a * 2);
    } else k.rig.setGlow(1);
    // Lead from the Front: link lines to the footmen in its aura.
    const chest = k.rig.attach('carry') ?? { sx: k.sx, sy: k.sy - 60 };
    for (const u of w.soldiers) {
      if (u.owner !== p.slot || u.hp <= 0) continue;
      const s = this.soldiers.get(u.id);
      if (!s || s.dying) continue;
      const m = u.effects.find((e) => e.def === 'morale');
      const ua = m ? moraleAlpha(m.remaining * STEP_MS, total) : 0;
      if (ua > 0) {
        this.aura(s.sx, s.sy, 0.42, ua);
        s.rig.setGlow(1 + ua * 2);
      } else s.rig.setGlow(1);
      if (!u.effects.some((e) => e.def === 'aura_lead_from_the_front')) continue;
      const body = s.sy - this.footInfo.bodyH * this.w.unitPx * 0.55;
      this.lines.draw().lineStyle(2, color, 0.5).lineBetween(chest.sx, chest.sy, s.sx, body);
    }
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
      s.rig.setPosition(at.sx, at.sy);
      const moving = Math.hypot(u.vx, u.vy) > 0.05;
      if (moving || !s.facing) {
        const dir = moving
          ? { x: u.vx, y: u.vy }
          : { x: Math.cos(u.facing), y: Math.sin(u.facing) };
        s.facing = pickFacing(dir.x, dir.y, s.facing);
        s.rig.setView(s.facing.view, s.facing.mirror);
      }
      if (!playing(s.rig)) s.rig.play(moving ? 'walk' : 'idle');
      const sh = this.footInfo.shadow;
      this.w.marks.shadow(at.sx, at.sy, sh[0] * 2, sh[1] * 2);
    }
  }

  private syncFlags(w: World) {
    for (const p of w.players) {
      const cur = this.flags.get(p.slot);
      const at = p.flag;
      if (cur && (!at || cur.at.x !== at.x || cur.at.y !== at.y)) {
        for (const a of cur.parts) a.img.destroy();
        this.flags.delete(p.slot);
      }
      if (!at || this.flags.has(p.slot)) continue;
      // Planted: ring (ground), pole, cloth in his color, trim (§2.4).
      const s = this.w.camera.worldToScreen(at.x, at.y);
      const cloth = placeFrame(this.w, fk('rally-flag/cloth'), 'world', s.sx, s.sy, {
        sortY: s.sy + 0.001,
      });
      cloth.img.setTint(theme.players[p.color].fill.num);
      this.flags.set(p.slot, {
        at: { ...at },
        parts: [
          placeFrame(this.w, fk('rally-flag/ring'), 'groundOverlay', s.sx, s.sy),
          placeFrame(this.w, fk('rally-flag/pole'), 'world', s.sx, s.sy, { sortY: s.sy }),
          cloth,
          placeFrame(this.w, fk('rally-flag/cloth-trim'), 'world', s.sx, s.sy, {
            sortY: s.sy + 0.002,
          }),
        ],
      });
      this.w.fx.ring('ours', at.x, at.y, 0.8, 420);
    }
  }

  private drawCells(w: World, f: FrameInput) {
    const live = new Set<EntityId>();
    const cam = this.w.camera;
    for (const c of w.thrown ?? []) {
      live.add(c.id);
      let cell = this.cells.get(c.id);
      if (!cell) {
        const img = placeFrame(this.w, fk('power-cell'), 'world', -999, -999);
        const shadow = this.w.scene.make
          .image({ key: SHADOW_TEXTURE } as Phaser.Types.GameObjects.Sprite.SpriteConfig, false)
          .setVisible(false);
        this.w.layers.groundOverlay.add(shadow);
        cell = { img, shadow, from: null, fromFoot: null };
        this.cells.set(c.id, cell);
      }
      const thrower = this.knight(c.from);
      const receiver = this.knight(c.to);
      const elapsed = (w.tick - c.launchedAt - 1 + f.alpha) * STEP_MS;
      const flight = (c.landsAt - c.launchedAt) * STEP_MS;
      const u = throwProgress(elapsed, flight, THROW_RELEASE_MS);
      const hand = thrower?.rig.attach('lens') ?? cam.worldToScreen(c.x0, c.y0, 1);
      const handFoot = thrower ? { sx: thrower.sx, sy: thrower.sy } : cam.worldToScreen(c.x0, c.y0);
      if (u <= 0) {
        // In the hand until the release.
        cell.img.img.setPosition(hand.sx, hand.sy).setDepth(handFoot.sy + 1);
        cell.shadow.setVisible(false);
        continue;
      }
      cell.from ??= { ...hand };
      cell.fromFoot ??= { ...handFoot };
      const toFoot =
        receiver && !receiver.down
          ? { sx: receiver.sx, sy: receiver.sy }
          : cam.worldToScreen(c.x, c.y);
      const to = (receiver && !receiver.down ? receiver.rig.attach('carry') : null) ?? toFoot;
      const tiles = Math.hypot(c.x - c.x0, c.y - c.y0);
      const pt = throwArc(
        cell.from,
        cell.fromFoot,
        to,
        toFoot,
        u,
        Math.max(MIN_PEAK_PX, tiles * PEAK_PX_PER_TILE),
      );
      cell.img.img
        .setPosition(pt.sx, pt.sy)
        .setDepth(pt.shadowSy + 1)
        .setRotation(u * 6);
      const k = Math.max(0.25, 0.5 - pt.lift * 0.002);
      cell.shadow.setPosition(pt.shadowSx, pt.shadowSy).setScale(k, k).setVisible(true);
    }
    for (const [id, cell] of this.cells) {
      if (live.has(id)) continue;
      cell.img.img.destroy();
      cell.shadow.destroy();
      this.cells.delete(id);
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
    for (const f of this.flags.values()) for (const a of f.parts) a.img.destroy();
    for (const c of this.cells.values()) {
      c.img.img.destroy();
      c.shadow.destroy();
    }
    this.soldiers.clear();
    this.flags.clear();
    this.cells.clear();
    this.ground.destroy();
    this.lines.destroy();
  }
}
