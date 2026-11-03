// The run drawn from sim state (SPEC §15.2) through the renderer in render/: the map and lanes, the
// Citadel with sentries and damage stages, the Armory, knights (rings with the aim notch, carry pips,
// the amber super-ready pulse, nametags and HP bars that flip below near the top, aim lines, the
// build ghost and arc, the Ranger's shot (draw, hold, release; the bolt leaves from the bow), super
// and build kneel with the deploy beacon, down piles and respawns), enemies (walk, attack, hit and
// death clips; stun forces idle; FF10: tell glows, the Skitter's core throb, the Stalker's target
// thread, Wasp hover over its shadow, mites at their own sizes and paces, shots from the weapon,
// burn/poison tick flashes), pulse turrets (aim and muzzle flashes), projectiles, crate piles,
// danger markers and the debug overlays. Positions are lerped between the last two sim steps; the
// sim is read, never written.
import { lerp } from '@pcg/game-kit';
import type * as Phaser from 'phaser';
import type { Content } from '../../content';
import type { ClassId, EffectId, LaneId } from '../../shared/ids';
import { LANE_IDS } from '../../shared/ids';
import { theme } from '../../shared/theme';
import { neonKnightsShared } from '../../themes/neon-knights/shared';
import type { ArtImage } from '../render/atlas';
import { drawBowString } from '../render/bowString';
import { pickFacing, enemyMirror, type Facing } from '../render/aim';
import { KNIGHT_DOWN } from '../render/clipKit';
import { ATTACK_MS, BUILD_PLACE_MS } from '../render/clips/ranger';
import { BUILD_TAP_MS } from '../render/clips/warden';
import { placeFrame } from '../render/context';
import { clipLandedMs, spawnPile } from '../render/fall';
import { RIG_INFO, type RigInfo } from '../render/gallery/rigInfo';
import { fk, iconFrame } from '../render/keys';
import { TILE_W } from '../render/camera';
import { MapView } from '../render/map';
import { mitePack } from '../render/swarm';
import type { RigSprite } from '../render/rig';
import { locomotionClip, locomotionSpeed, StatusSprites } from '../render/status';
import { Citadel, frameAt, type SentryId } from '../render/structures';
import type { IconKey, ProjectileKind, ProjectileSprite, StatusLook } from '../render/types';
import type { RenderWorld } from '../render/world';
import { buildTile, placementValid } from '../sim';
import {
  BASE_ID,
  STEP_MS,
  type EnemyEnt,
  type EntityId,
  type PlayerEnt,
  type SimEvent,
  type World,
} from '../sim/types';
import {
  chargeLevel,
  drawGlow,
  enemyShotPos,
  pulseHz,
  pulseLevel,
  TELL_GLOW,
  type EnemyShot,
} from './enemyFx';
import { anchorToWorld, shotPos, shotTiming, type Launch, type Pos } from './shot';
import { shotAnchor } from './support';
import { SupportView } from './supportView';
import { StructuresView } from './structuresView';
import { superPulse } from './superPulse';
import { syncTag, type TagState } from './tag';
import { wardenAttack } from './wardenFx';

export type { Pos } from './shot';

export interface Overlays {
  hitbox: boolean;
  range: boolean;
  flow: boolean;
}

export interface FrameInput {
  world: World;
  /** Positions before the latest step, by entity id. */
  prev: ReadonlyMap<EntityId, Pos>;
  alpha: number;
  /** Every event of the steps run since the last frame, in order. */
  events: readonly SimEvent[];
  dtMs: number;
  overlays: Overlays;
}

/** Map v1 anchors (SPEC §15.2): the Citadel's front-center and the Armory pad's center. */
const CITADEL_AT = { x: 18, y: 2 };
const ARMORY_AT = { x: 22.5, y: 1.5 };
/** Knights near the top edge (by the Citadel) get their label below the sprite (§2.1). */
const FLIP_BELOW_Y = 4;
/** A jump longer than this between two steps (respawn, debug) snaps instead of lerping. */
const SNAP_TILES = 2;
const ONE_SHOTS = new Set(['attack', 'super', 'build', 'hit', 'respawn', 'throw', 'plant']);
/** How long a shot keeps the Ranger facing and in his `ready` pose, ms: the whole attack clip. */
const SHOT_HOLD_MS = ATTACK_MS + 20;
/** Steady Aim turns on after 600 ms with the stick released (content passive, FF6). */
const STEADY_TICKS = 36;

const LOOK_OF: Partial<Record<EffectId, StatusLook>> = {
  burn: 'burn',
  poison: 'poison',
  stun: 'stun',
  slow: 'slow',
};

const playing = (rig: RigSprite) => rig.clip !== null && ONE_SHOTS.has(rig.clip) && !rig.clipDone;
/** Screen rotation of a world-ground angle (§2.5: y squashed by 0.6). */
const screenRot = (a: number) => Math.atan2(Math.sin(a) * 0.6, Math.cos(a));

interface Knight {
  id: EntityId;
  slot: number;
  rig: RigSprite;
  info: RigInfo;
  facing: Facing | null;
  shotUntil: number;
  shotAngle: number;
  /** The main shot's bolt waits this long for the clip's release, ms (shot.ts). */
  shotDelay: number;
  sx: number;
  sy: number;
  /** Interpolated world position (the shot origin's feet). */
  wx: number;
  wy: number;
  down: { t: number; landed: number; holdMs: number; dimmed: boolean; piled: boolean } | null;
  tag: Phaser.GameObjects.Text;
  tagState: TagState;
  reconnect: ArtImage;
  ghost: ArtImage;
  arc: { tile: ArtImage; glyph: ArtImage }[];
}

interface Enemy {
  rig: RigSprite;
  info: RigInfo;
  mirror: boolean;
  status: StatusSprites | null;
  dying: { t: number; landed: number; holdMs: number; piled: boolean } | null;
  sx: number;
  sy: number;
  /** Interpolated world position (shot origins). */
  wx: number;
  wy: number;
  /** A wind-up tell in progress (FF10): when it started and how long it is, ms. */
  tell: { t0: number; ms: number } | null;
  /** Skitter core throb phase, cycles. */
  pulse: number;
  /** Locomotion playback rate (each mite its own). */
  clipSpeed: number;
}

interface Timer {
  at: number;
  fn: () => void;
}

export class WorldView {
  private readonly map: MapView;
  /** The Artificer, the Commander and his squad (FF9). */
  private readonly support: SupportView;
  private readonly citadel: Citadel;
  private readonly knights = new Map<number, Knight>();
  private readonly enemies = new Map<EntityId, Enemy>();
  private readonly structs: StructuresView;
  private readonly shots = new Map<EntityId, ProjectileSprite>();
  private readonly launches = new Map<EntityId, Launch>();
  private readonly launchers = new Map<EntityId, Knight>();
  private readonly enemyShots = new Map<EntityId, EnemyShot>();
  private readonly piles = new Map<EntityId, ArtImage[]>();
  private readonly ui: Phaser.GameObjects.Graphics;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly debug: Phaser.GameObjects.Graphics;
  /** Enemy tells and the Skitter core throb (effects layer, so the bloom takes them). */
  private readonly glow: Phaser.GameObjects.Graphics;
  private timers: Timer[] = [];
  private t = 0;
  private openLanes = new Set<LaneId>();

  constructor(
    private readonly w: RenderWorld,
    private readonly content: Content,
  ) {
    this.map = new MapView(w, w.theme.map);
    this.citadel = new Citadel(w, CITADEL_AT.x, CITADEL_AT.y);
    this.support = new SupportView(w, content, (slot) => this.knights.get(slot) ?? null);
    this.structs = new StructuresView(w, content);
    frameAt(w, fk('armory/pad'), 'ground', ARMORY_AT.x, ARMORY_AT.y);
    frameAt(w, fk('armory/kiosk'), 'world', ARMORY_AT.x, ARMORY_AT.y);
    const gfx = (layer: 'groundOverlay' | 'worldUi' | 'effects', depth: number) => {
      const g = w.scene.make.graphics({}, false).setDepth(depth);
      w.layers[layer].add(g);
      return g;
    };
    this.ground = gfx('groundOverlay', -5e5);
    this.ui = gfx('worldUi', -1);
    this.debug = gfx('worldUi', 1e6);
    this.glow = gfx('effects', 1e6);
    for (const l of LANE_IDS) this.map.setLane(l, 'sealed');
  }

  /** Dev fallback shapes drawn (e2e asserts none). */
  get fallbacks(): number {
    return this.w.lib.fallbacks;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push({ at: this.t + ms, fn });
  }

  private screen(id: EntityId, x: number, y: number, z: number, f: FrameInput) {
    const p = f.prev.get(id);
    let px = x;
    let py = y;
    let pz = z;
    if (p && Math.abs(p.x - x) + Math.abs(p.y - y) < SNAP_TILES) {
      px = lerp(p.x, x, f.alpha);
      py = lerp(p.y, y, f.alpha);
      pz = lerp(p.z, z, f.alpha);
    }
    return { x: px, y: py, z: pz, ...this.w.camera.worldToScreen(px, py, pz) };
  }

  update(f: FrameInput) {
    this.t += f.dtMs;
    const due = this.timers.filter((x) => x.at <= this.t);
    if (due.length > 0) {
      this.timers = this.timers.filter((x) => x.at > this.t);
      for (const d of due) d.fn();
    }
    const w = f.world;
    this.syncLanes(w);
    this.syncKnights(w);
    this.syncEnemies(w);
    this.structs.sync(w, f.events);
    for (const e of f.events) {
      this.event(e, w);
      this.structs.event(e, w);
    }
    this.ground.clear();
    this.ui.clear();
    this.debug.clear();
    this.glow.clear();
    this.w.marks.begin();
    this.drawCitadel(w, f.dtMs);
    this.drawKnights(w, f);
    this.support.update(f);
    this.structs.update(w, f.dtMs, (p) => this.knights.get(p.slot)?.rig.attach('hammer') ?? null);
    this.drawEnemies(w, f);
    this.drawProjectiles(w, f);
    this.drawPiles(w);
    this.drawMarkers(w);
    if (f.overlays.hitbox || f.overlays.range || f.overlays.flow) this.drawOverlays(w, f);
    this.w.update(f.dtMs);
    for (const k of this.knights.values()) drawBowString(k.rig);
  }

  // ---- entity lifecycles ----------------------------------------------------------------------------

  private syncLanes(w: World) {
    const open = new Set<LaneId>(
      this.content.waves.filter((d) => d.n <= Math.max(1, w.wave)).flatMap((d) => d.lanes),
    );
    for (const l of LANE_IDS) {
      if (open.has(l) !== this.openLanes.has(l))
        this.map.setLane(l, open.has(l) ? 'open' : 'sealed');
    }
    this.openLanes = open;
  }

  private rigFor(classId: ClassId) {
    return this.w.theme.rigFor.class[classId];
  }

  private icon(id: string, layer: 'worldUi' = 'worldUi', size = 0.8): ArtImage {
    const a = this.w.lib.image(iconFrame(id as IconKey), [12, 12]);
    this.w.lib.setUnitScale(a, size * 1.6);
    a.img.setVisible(false);
    this.w.layers[layer].add(a.img);
    return a;
  }

  private tile(active: boolean): ArtImage {
    const a = this.w.lib.image(iconFrame(active ? 'badge-tile-active' : 'badge-tile'), [26, 26]);
    this.w.lib.setUnitScale(a, 0.8);
    a.img.setVisible(false);
    this.w.layers.worldUi.add(a.img);
    return a;
  }

  private syncKnights(w: World) {
    for (const p of w.players) {
      if (this.knights.has(p.slot)) continue;
      const rigId = this.rigFor(p.classId);
      const rig = this.w.rig(rigId, {
        view: 'front',
        tint: theme.players[p.color].fill.num,
        clip: 'idle',
      });
      const tag = this.w.scene.add
        .text(0, 0, p.name, {
          fontFamily: theme.font.sans,
          fontSize: '17px',
          fontStyle: '600',
          color: theme.color.foreground.hex,
          stroke: theme.color.brandInk.hex,
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1);
      this.w.layers.worldUi.add(tag);
      const arc = [0, 1, 2, 3].map(() => ({
        tile: this.tile(false),
        glyph: this.icon('act-give'),
      }));
      const ghost = placeFrame(this.w, fk('build-ghost/valid'), 'groundOverlay', 0, 0);
      ghost.img.setVisible(false);
      this.knights.set(p.slot, {
        id: p.id,
        slot: p.slot,
        rig,
        info: RIG_INFO[rigId] ?? RIG_INFO.ranger!,
        facing: null,
        shotUntil: 0,
        shotAngle: 0,
        shotDelay: 0,
        sx: 0,
        sy: 0,
        wx: p.x,
        wy: p.y,
        down: null,
        tag,
        tagState: { color: theme.color.foreground.hex },
        reconnect: this.icon('reconnecting'),
        ghost,
        arc,
      });
    }
  }

  private syncEnemies(w: World) {
    const live = new Set<EntityId>();
    for (const e of w.enemies) {
      live.add(e.id);
      if (this.enemies.has(e.id)) continue;
      const rigId = this.w.theme.rigFor.enemy[e.kind];
      const info = RIG_INFO[rigId] ?? RIG_INFO.drone!;
      // Scrap mites: mixed sizes, each at its own pace and phase, never in step (§9.6); the
      // jitter itself runs in the sim.
      const mite = e.kind === 'swarm' ? mitePack(e.id, 1)[0]! : null;
      const rig = this.w.rig(rigId, { view: 'side', clip: 'walk', scale: mite?.scale });
      rig.play('walk', { offsetMs: mite?.offsetMs ?? (e.id * 97) % 500, fadeMs: 0 });
      this.enemies.set(e.id, {
        rig,
        info,
        mirror: Math.cos(e.facing) < 0,
        status: null,
        dying: null,
        sx: 0,
        sy: 0,
        wx: e.x,
        wy: e.y,
        tell: null,
        pulse: 0,
        clipSpeed: mite?.speed ?? 1,
      });
    }
    // Gone without a death event (a debug wave jump): remove at once.
    for (const [id, en] of this.enemies) {
      if (live.has(id) || en.dying) continue;
      if (!w.events.some((x) => x.e === 'death' && x.id === id)) this.dropEnemy(id, en);
    }
  }

  private dropEnemy(id: EntityId, en: Enemy) {
    en.rig.destroy();
    en.status?.destroy();
    this.enemies.delete(id);
  }

  // ---- events -------------------------------------------------------------------------------------

  private knightById(id: EntityId): Knight | null {
    for (const k of this.knights.values()) if (k.id === id) return k;
    return null;
  }

  private event(e: SimEvent, w: World) {
    this.support.event(e, w);
    switch (e.e) {
      case 'attack':
        return this.attack(e, w);
      case 'damage': {
        const en = this.enemies.get(e.target);
        if (en && !en.dying) {
          // A burn or poison tick is only the white flash (art README: status effects).
          if (e.kind === 'dot') {
            en.rig.flash(60);
            return;
          }
          if (!playing(en.rig) || en.rig.clip === 'hit')
            en.rig.play('hit', { restart: true, fadeMs: 0 });
          en.rig.flash(60);
          this.w.fx.burst('spark-ours', en.sx, en.sy - en.info.bodyH * this.w.unitPx * 0.5);
          return;
        }
        const k = this.knightById(e.target);
        if (k && !k.down) {
          k.rig.flash(60);
          if (!playing(k.rig)) k.rig.play('hit', { restart: true, fadeMs: 0 });
          this.w.fx.burst('spark-theirs', k.sx, k.sy - k.info.bodyH * this.w.unitPx * 0.5);
        }
        if (e.target === BASE_ID) this.citadel.hit();
        return;
      }
      case 'death':
        if (e.what === 'enemy') {
          const en = this.enemies.get(e.id);
          if (!en) return;
          const clip = this.w.theme.clips[`${en.rig.rigId}/death`];
          en.rig.play('death', { restart: true, fadeMs: 0 });
          en.rig.setUnlit(true);
          en.rig.flash(60);
          en.status?.destroy();
          en.status = null;
          const landed = clip ? clipLandedMs(clip) : 0;
          en.dying = {
            t: 0,
            landed,
            holdMs: clip ? clip.durationMs - landed : 600,
            piled: false,
          };
        } else if (e.what === 'player') {
          const k = this.knightById(e.id);
          const p = w.players.find((x) => x.id === e.id);
          if (!k || !p) return;
          k.rig.setPose('stand', 0);
          k.rig.play('down', { restart: true, fadeMs: 0 });
          const clips = this.w.theme.clips;
          const rid = k.rig.rigId;
          const clip = clips[`${rid}/down@${k.rig.view}`] ?? clips[`${rid}/down`];
          const landed = clip ? clipLandedMs(clip) : 700;
          const downMs = p.respawnAt === null ? 0 : (p.respawnAt - w.tick) * STEP_MS;
          k.down = {
            t: 0,
            landed,
            holdMs: Math.max(0, downMs - landed),
            dimmed: false,
            piled: false,
          };
        }
        return;
      case 'respawn': {
        const k = this.knights.get(e.slot);
        if (!k) return;
        k.down = null;
        k.rig.setUnlit(false);
        k.rig.setAlpha(1);
        k.rig.play('respawn', { restart: true, fadeMs: 0 });
        return;
      }
      case 'built': {
        const k = this.knights.get(e.slot);
        if (k && !k.down) k.rig.play('build', { restart: true, fadeMs: 60 });
        const [c, r] = e.tile;
        // The structure sketches and fills once the builder's hands reach the ground (FF8).
        const ranger = k?.rig.rigId === 'ranger';
        this.structs.built(e, !k ? 0 : ranger ? BUILD_PLACE_MS : BUILD_TAP_MS);
        if (!ranger) return;
        // The deploy beacon lands as he reaches the ground; the turret unfolds over it (§2.4).
        this.later(BUILD_PLACE_MS, () => {
          const b = frameAt(this.w, fk('deploy-beacon'), 'world', c + 0.5, r + 0.55);
          this.w.fx.ring('ours', c + 0.5, r + 0.5, 0.7);
          this.later(500, () => b.img.setAlpha(0.5));
          this.later(900, () => b.img.destroy());
        });
        return;
      }
      case 'runEnd':
        if (e.result === 'defeat') this.citadel.collapse(this.w.fx);
        return;
      case 'baseHit':
        this.citadel.hit();
        return;
      default:
        return;
    }
  }

  private attack(e: Extract<SimEvent, { e: 'attack' }>, w: World) {
    const fx = this.w.fx;
    if (e.source === BASE_ID) {
      const id: SentryId =
        e.x < CITADEL_AT.x - 0.5 ? 'left' : e.x > CITADEL_AT.x + 0.5 ? 'right' : 'window';
      if (id !== 'window') this.citadel.aimSentryAt(id, e.angle);
      const m = this.citadel.sentryScreen(id);
      fx.burst('muzzle-ours', m.sx, m.sy - 8, screenRot(e.angle));
      return;
    }
    if (this.structs.attack(e)) return;
    const en = this.enemies.get(e.source);
    if (en && !en.dying) {
      en.mirror = enemyMirror(Math.cos(e.angle), en.mirror);
      en.rig.play('attack', { restart: true, fadeMs: 60 });
      // The wind-up is the tell (§9.6): its glow runs for the content's wind-up.
      const kind = w.enemies.find((x) => x.id === e.source)?.kind;
      const windupMs = this.content.enemies.find((d) => d.id === kind)?.attack.windupMs ?? 0;
      en.tell = windupMs > 0 ? { t0: this.t, ms: windupMs } : null;
      if (en.rig.rigId === 'skitter') {
        // The Runner's burst: a violet blast from its core.
        const c = en.rig.attach('core') ?? { sx: en.sx, sy: en.sy };
        fx.burst('spark-theirs', c.sx, c.sy);
        fx.burst('spark-theirs', c.sx + 8, c.sy - 6, 0, 40);
        fx.ring('theirs', e.x, e.y, 0.9, 380);
      }
      return;
    }
    const k = this.knightById(e.source);
    const p = w.players.find((x) => x.id === e.source);
    if (!k || !p || k.down) return;
    k.shotUntil = this.t + SHOT_HOLD_MS;
    k.shotAngle = e.angle;
    k.facing = pickFacing(Math.cos(e.angle), Math.sin(e.angle), k.facing);
    k.rig.setView(k.facing.view, k.facing.mirror);
    if (this.support.attack(e, p, k)) return;
    if (p.classId === 'warden') {
      // The slam and the stomp land on their clips' impact frames (FF8, wardenFx.ts).
      k.shotDelay = 0;
      const def = this.content.characters.find((c) => c.id === p.classId);
      if (def) wardenAttack(this.w, k.rig, e, def, (ms, fn) => this.later(ms, fn));
      return;
    }
    if (e.slot === 'main') {
      // Aiming or in Steady Aim he is already at full draw and only holds; otherwise he draws first.
      // Firing without Steady Aim snaps to `ready` for the shot (§15.2 poses).
      const drawn = k.rig.pose === 'ready' && !playing(k.rig);
      const timing = shotTiming(k.rig.rigId, drawn);
      k.shotDelay = timing.delayMs;
      k.rig.setPose('ready', 0);
      k.rig.play('attack', { restart: true, fadeMs: drawn ? 40 : 0, offsetMs: timing.offsetMs });
      // Muzzle flash and tracer at the bow on the release (C2 note 2).
      const release = () => {
        const m = k.down ? null : k.rig.attach(shotAnchor(k.rig.rigId));
        if (!m) return;
        const rot = screenRot(e.angle);
        fx.burst('muzzle-ours', m.sx, m.sy, rot);
        const len = 56;
        fx.tracer(
          'ours',
          m,
          { sx: m.sx + Math.cos(rot) * len, sy: m.sy + Math.sin(rot) * len },
          90,
        );
      };
      if (timing.delayMs > 0) this.later(timing.delayMs, release);
      else release();
    } else {
      k.shotDelay = 0;
      k.rig.setPose('ready', 0);
      k.rig.play('super', { restart: true, fadeMs: 40 });
      // The pulse ring is sized exactly to the hit circle (§2.4).
      const def = this.content.characters.find((c) => c.id === p.classId);
      fx.ring('ours', e.x, e.y, def?.super.radius ?? def?.super.range ?? 3, 520);
    }
  }

  // ---- drawing ------------------------------------------------------------------------------------

  private drawCitadel(w: World, dt: number) {
    const shop = w.team.shop;
    this.citadel.setLoadout(
      (shop.archer_damage ?? 0) > 0,
      (shop.archer_range ?? 0) > 0,
      (shop.archer_third ?? 0) > 0 || w.base.archers.count > 2,
    );
    if (!this.citadel.collapsing && w.base.hp > 0)
      this.citadel.setStage(w.base.stage ?? Citadel.stageFor(w.base.hp / w.base.maxHp));
    this.citadel.update(dt);
  }

  private aimOf(p: PlayerEnt, k: Knight): number | null {
    if (p.mainAim && (p.mainAim.x !== 0 || p.mainAim.y !== 0))
      return Math.atan2(p.mainAim.y, p.mainAim.x);
    if (this.t < k.shotUntil) return k.shotAngle;
    return null;
  }

  private drawKnights(w: World, f: FrameInput) {
    const marks = this.w.marks;
    const k1 = this.w.unitPx;
    for (const p of w.players) {
      const k = this.knights.get(p.slot);
      if (!k) continue;
      const at = this.screen(p.id, p.x, p.y, 0, f);
      k.sx = at.sx;
      k.sy = at.sy;
      k.wx = at.x;
      k.wy = at.y;
      const rig = k.rig;
      rig.setPosition(at.sx, at.sy);
      const def = this.content.characters.find((c) => c.id === p.classId);
      const color = theme.players[p.color].fill.num;
      rig.setTint(color);

      if (k.down) {
        k.down.t += f.dtMs;
        if (!k.down.dimmed && k.down.t >= KNIGHT_DOWN.dimMs) {
          k.down.dimmed = true;
          rig.setUnlit(true);
        }
        if (!k.down.piled && k.down.t >= k.down.landed) {
          k.down.piled = true;
          spawnPile(this.w.fx, 'ours', at.sx, at.sy, k1, {
            holdMs: k.down.holdMs,
            seed: rig.rigId,
          });
        }
      } else {
        const aim = this.aimOf(p, k);
        const moving = Math.hypot(p.vx, p.vy) > 0.05;
        const dir =
          aim !== null
            ? { x: Math.cos(aim), y: Math.sin(aim) }
            : moving
              ? { x: p.vx, y: p.vy }
              : { x: 0, y: 0 };
        k.facing = pickFacing(dir.x, dir.y, k.facing);
        rig.setView(k.facing.view, k.facing.mirror);
        // Steady Aim blends into `ready`; a shot snaps to it (§15.2 poses).
        const steady = w.phase === 'combat' && p.stillTicks >= STEADY_TICKS;
        if (aim !== null || this.t < k.shotUntil) rig.setPose('ready', 0);
        else rig.setPose(steady ? 'ready' : 'stand', steady ? 300 : 160);
        if (!playing(rig)) {
          const looks = looksOf(p.effects);
          rig.play(p.connected ? locomotionClip(moving, looks) : 'idle', {
            speed: locomotionSpeed(looks),
          });
        }
        // Dazed: translucent while the phone is away (§11.3).
        rig.setAlpha(p.connected ? 1 : 0.45);
      }

      // Ground: shadow, ring with the aim notch, carried-cell pips (§2.4). Super ready pulses the
      // ring with amber light (§10.1, C2), under the colored ring so the player color stays on top.
      const ring = k.info.ring ?? 0.68;
      marks.shadow(at.sx, at.sy, k.info.shadow[0] * 2, k.info.shadow[1] * 2);
      if (!k.down) {
        const pulse = superPulse(p, this.t);
        if (pulse) marks.superRing(at.sx, at.sy, ring, pulse.color, pulse.scale, pulse.alpha);
        marks.ring(at.sx, at.sy, ring, color, this.aimOf(p, k) ?? p.facing);
        if (p.crates > 0) marks.carry(at.sx, at.sy, ring, p.crates, def?.carryCap ?? 4);
      }

      this.drawKnightUi(w, p, k, at, color);
    }
  }

  private drawKnightUi(
    w: World,
    p: PlayerEnt,
    k: Knight,
    at: { x: number; y: number; sx: number; sy: number },
    color: number,
  ) {
    const g = this.ui;
    const head = k.rig.attach('nametag') ?? { sx: at.sx, sy: at.sy - k.info.bodyH * this.w.unitPx };
    const below = at.y < FLIP_BELOW_Y;
    const tagY = below ? at.sy + 34 : head.sy - 14;
    // Nametag, or the respawn countdown where the name was (§2.4).
    const label =
      p.respawnAt !== null
        ? String(Math.max(1, Math.ceil(((p.respawnAt - w.tick) * STEP_MS) / 1000)))
        : p.name;
    k.tag.setPosition(at.sx, tagY).setOrigin(0.5, below ? 0 : 1);
    // Only on change: a Text redraw re-uploads its texture (scene/tag.ts).
    const tagColor = p.respawnAt !== null ? theme.color.muted.hex : theme.color.foreground.hex;
    syncTag(k.tag, k.tagState, label, tagColor);
    k.tag.setAlpha(p.connected ? 1 : 0.7);
    // Reconnecting icon on the nametag (§11.3).
    k.reconnect.img
      .setVisible(!p.connected)
      .setPosition(at.sx - k.tag.width / 2 - 14, below ? tagY + 11 : tagY - 11);
    // HP bar under the name (above the feet when flipped).
    if (p.respawnAt === null) {
      const bw = 46;
      const bh = 5;
      const by = below ? tagY + 24 : tagY + 3;
      const f = Math.max(0, Math.min(1, p.hp / p.maxHp));
      g.fillStyle(theme.color.brandInk.num, 0.85).fillRect(
        at.sx - bw / 2 - 1,
        by - 1,
        bw + 2,
        bh + 2,
      );
      g.fillStyle(f > 0.3 ? color : theme.color.danger.num, 1).fillRect(
        at.sx - bw / 2,
        by,
        bw * f,
        bh,
      );
    }
    // Aim line while the main button is held (§10.1: drawn on the TV, not the phone).
    if (p.mainAim && p.respawnAt === null && (p.mainAim.x !== 0 || p.mainAim.y !== 0)) {
      const def = this.content.characters.find((c) => c.id === p.classId);
      const range = def?.main.range ?? 6;
      const a = Math.atan2(p.mainAim.y, p.mainAim.x);
      this.dashed(
        g,
        at.x,
        at.y,
        at.x + Math.cos(a) * range,
        at.y + Math.sin(a) * range,
        theme.color.amber.num,
      );
    }
    // Build ghost at the feet (§10.2): dashed amber when valid, red with an X when blocked.
    const ghost = w.phase === 'build' && p.ghost !== null && p.respawnAt === null;
    k.ghost.img.setVisible(ghost);
    if (ghost) {
      // Fortify's ghost sits on the tower it would attach to (FF8).
      const [c, r] = buildTile(w, p.ghost!, p);
      const valid = placementValid(w, p.ghost!, [c, r], p.slot);
      this.w.lib.setFrame(k.ghost, valid ? fk('build-ghost/valid') : fk('build-ghost/blocked'));
      const s = this.w.camera.worldToScreen(c + 0.5, r + 0.5);
      k.ghost.img.setPosition(s.sx, s.sy);
    }
    this.drawArc(p, k, head);
  }

  /** The build arc above the head while the action button is held (§10.1): left, up, right, Give. */
  private drawArc(p: PlayerEnt, k: Knight, head: { sx: number; sy: number }) {
    const open = p.radialOpen && p.respawnAt === null;
    const def = this.content.characters.find((c) => c.id === p.classId);
    const kit = def?.build ?? [];
    const cx = head.sx;
    const cy = head.sy - 70;
    const R = 46;
    const offs = [
      [-R, 0],
      [0, -R],
      [R, 0],
      [0, R * 0.55],
    ] as const;
    k.arc.forEach((slot, i) => {
      const id = i === 3 ? 'give' : kit[i];
      const show = open && id !== undefined;
      slot.tile.img.setVisible(show);
      slot.glyph.img.setVisible(show);
      if (!show) return;
      const glyph = id === 'give' ? 'act-give' : neonKnightsShared.iconFor.structure[id];
      const cost =
        id === 'give' ? 1 : (this.content.structures.find((s) => s.id === id)?.cost ?? 99);
      const enabled = p.crates >= cost;
      const on = p.radialSlot === i;
      this.w.lib.setFrame(slot.tile, iconFrame(on ? 'badge-tile-active' : 'badge-tile'));
      this.w.lib.setFrame(slot.glyph, iconFrame(glyph as IconKey));
      const [dx, dy] = offs[i]!;
      slot.tile.img.setPosition(cx + dx, cy + dy);
      slot.glyph.img.setPosition(cx + dx, cy + dy).setAlpha(enabled ? 1 : 0.35);
    });
  }

  private dashed(
    g: Phaser.GameObjects.Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: number,
  ) {
    const a = this.w.camera.worldToScreen(x0, y0);
    const b = this.w.camera.worldToScreen(x1, y1);
    const len = Math.hypot(b.sx - a.sx, b.sy - a.sy);
    const n = Math.max(1, Math.floor(len / 14));
    g.lineStyle(3, color, 0.85);
    for (let i = 0; i < n; i += 2) {
      const u0 = i / n;
      const u1 = Math.min(1, (i + 1) / n);
      g.lineBetween(
        lerp(a.sx, b.sx, u0),
        lerp(a.sy, b.sy, u0),
        lerp(a.sx, b.sx, u1),
        lerp(a.sy, b.sy, u1),
      );
    }
  }

  private drawEnemies(w: World, f: FrameInput) {
    const byId = new Map<EntityId, EnemyEnt>(w.enemies.map((e) => [e.id, e]));
    for (const [id, en] of this.enemies) {
      const e = byId.get(id);
      if (en.dying) {
        en.dying.t += f.dtMs;
        if (!en.dying.piled && en.dying.t >= en.dying.landed) {
          en.dying.piled = true;
          spawnPile(this.w.fx, 'theirs', en.sx, en.sy, this.w.unitPx, {
            big: en.info.hitbox >= 0.5,
            holdMs: en.dying.holdMs,
            seed: en.rig.rigId,
          });
        }
        if (en.rig.clipDone) this.dropEnemy(id, en);
        this.w.marks.shadow(en.sx, en.sy, en.info.shadow[0] * 2, en.info.shadow[1] * 2, 0.25);
        continue;
      }
      if (!e) continue;
      // On the ground: a Wasp hovers at its fixed height above its ground point, where its shadow
      // stays (§2.5 height, §9.6), so the sim's z isn't drawn.
      const at = this.screen(id, e.x, e.y, 0, f);
      en.sx = at.sx;
      en.sy = at.sy;
      en.wx = at.x;
      en.wy = at.y;
      const fly = (en.info.fly ?? 0) * TILE_W;
      en.rig.setPosition(at.sx, at.sy - fly, at.sy);
      const moving = Math.hypot(e.vx, e.vy) > 0.05;
      en.mirror = enemyMirror(moving ? e.vx : Math.cos(e.facing), en.mirror);
      en.rig.setView('side', en.mirror);
      const looks = looksOf(e.effects);
      if (looks.length > 0 && !en.status)
        en.status = new StatusSprites(this.w, en.rig, en.info.bodyH, en.info.legH, id);
      en.status?.set(looks);
      const stunned = looks.includes('stun');
      if (stunned) en.tell = null;
      // Stunned units always idle (C1 note 11); slowed ones walk sluggishly.
      if (!playing(en.rig) || stunned)
        en.rig.play(locomotionClip(moving, looks), {
          speed: locomotionSpeed(looks) * en.clipSpeed,
        });
      en.status?.update(f.dtMs, at.sx, at.sy - fly);
      const k = fly > 0 ? 0.75 : 1; // the shadow far below reads smaller
      this.w.marks.shadow(at.sx, at.sy, en.info.shadow[0] * 2 * k, en.info.shadow[1] * 2 * k);
      if (!stunned) this.drawEnemyLooks(w, e, en, f.dtMs);
    }
  }

  /** Tell glows, the Skitter's core throb and the Stalker's target thread (FF10, §9.6). */
  private drawEnemyLooks(w: World, e: EnemyEnt, en: Enemy, dtMs: number) {
    const k1 = this.w.unitPx;
    const rigId = en.rig.rigId;
    if (en.tell) {
      const age = this.t - en.tell.t0;
      const level = chargeLevel(age, en.tell.ms);
      if (age > en.tell.ms + 100) en.tell = null;
      const spec = TELL_GLOW[rigId];
      const p = spec && this.tellPoint(en, spec.at);
      if (spec && p) drawGlow(this.glow, p.sx, p.sy, spec.r * k1, level * 1.2);
    }
    if (rigId === 'skitter') {
      const d = rectDistToBase(w, e.x, e.y);
      en.pulse += (dtMs / 1000) * pulseHz(d);
      const c = en.rig.attach('core');
      if (c) drawGlow(this.glow, c.sx, c.sy, 7 * k1, pulseLevel(en.pulse));
    }
    if (rigId === 'stalker' && e.ai === 'hunt' && e.hunting !== null) {
      const q = this.knights.get(e.hunting);
      const eyes = en.rig.attach('eyes');
      if (q && !q.down && eyes) {
        const to = { sx: q.sx, sy: q.sy - q.info.bodyH * k1 * 0.55 };
        this.ui
          .lineStyle(2, theme.color.hostile.num, 0.32)
          .lineBetween(eyes.sx, eyes.sy, to.sx, to.sy);
      }
    }
  }

  private tellPoint(en: Enemy, at: 'muzzle' | 'chest' | 'eyes') {
    if (at !== 'chest') return en.rig.attach(at);
    // The Brute's furnace grille: halfway up its body, a little toward its fist.
    const top = en.rig.attach('top');
    const fist = en.rig.attach('fist');
    if (!top || !fist) return null;
    const foot = { sx: en.sx, sy: en.sy };
    return {
      sx: lerp(foot.sx, top.sx, 0.5) + (fist.sx - foot.sx) * 0.2,
      sy: lerp(foot.sy, top.sy, 0.5),
    };
  }

  /**
   * Projectiles. A knight's shot waits on the bow for the attack clip's release, then leaves from
   * the rig's shot origin (`bolt`) at bow height and eases onto the sim's path (shot.ts, C2 note 2).
   */
  private drawProjectiles(w: World, f: FrameInput) {
    const live = new Set<EntityId>();
    for (const pr of w.projectiles) {
      live.add(pr.id);
      let launch = this.launches.get(pr.id);
      if (!launch) {
        const k = pr.side === 'ours' ? this.knightById(pr.source) : null;
        const delayMs = k && pr.slot === 'main' ? k.shotDelay : 0;
        // Mortar shells leave from the barrel (FF8).
        const origin = pr.arc ? this.structs.shellOrigin(pr) : null;
        launch = { bornMs: this.t, delayMs, origin };
        this.launches.set(pr.id, launch);
        if (k) this.launchers.set(pr.id, k);
      }
      if (this.t - launch.bornMs < launch.delayMs) continue;
      // The release: read the origin off the bow once.
      const k = this.launchers.get(pr.id);
      if (k) {
        this.launchers.delete(pr.id);
        const m = k.down ? null : k.rig.attach(shotAnchor(k.rig.rigId));
        if (m) launch.origin = anchorToWorld(m, { x: k.wx, y: k.wy }, this.w.camera);
      }
      const at = this.screen(pr.id, pr.x, pr.y, pr.z ?? 0, f);
      const pos = pr.side === 'theirs' ? this.enemyShot(pr, w, at) : shotPos(launch, this.t, at);
      if (!pos) continue;
      let s = this.shots.get(pr.id);
      if (!s) {
        s = this.w.fx.projectile(projectileKind(pr.from));
        this.shots.set(pr.id, s);
      }
      s.set(pos.x, pos.y, pos.z, Math.atan2(pr.vy, pr.vx));
    }
    for (const [id, s] of this.shots) {
      if (live.has(id)) continue;
      s.release();
      this.shots.delete(id);
    }
    for (const id of this.launches.keys()) {
      if (live.has(id)) continue;
      this.launches.delete(id);
      this.launchers.delete(id);
    }
    for (const id of this.enemyShots.keys()) if (!live.has(id)) this.enemyShots.delete(id);
  }

  /**
   * An enemy shot leaves from its weapon (C2 note 2): the Bombard's barrel, the Wasp's stinger. The
   * muzzle point is read once, with a muzzle flash, and its offset fades over the flight.
   */
  private enemyShot(pr: World['projectiles'][number], w: World, sim: Pos): Pos {
    let s = this.enemyShots.get(pr.id);
    if (!s) {
      const en = this.enemies.get(pr.source);
      const m = en && !en.dying ? en.rig.attach('muzzle') : null;
      const arc = pr.arc;
      const flightMs = (arc ? arc.landsAt - arc.launchedAt : pr.expiresAt - w.tick) * STEP_MS;
      s = {
        origin:
          m && en ? anchorToWorld(m, { x: en.wx, y: en.wy }, this.w.camera) : { ...sim, z: 0 },
        from: m && en ? { x: en.wx, y: en.wy } : { x: sim.x, y: sim.y },
        bornMs: this.t,
        flightMs,
        endZ: arc ? 0 : 0.5,
      };
      this.enemyShots.set(pr.id, s);
      if (m) this.w.fx.burst('muzzle-theirs', m.sx, m.sy, screenRot(Math.atan2(pr.vy, pr.vx)));
    }
    return enemyShotPos(s, this.t, sim);
  }

  private drawPiles(w: World) {
    const live = new Set<EntityId>();
    for (const pile of w.cratePiles) {
      live.add(pile.id);
      let imgs = this.piles.get(pile.id);
      if (!imgs) {
        imgs = [];
        this.piles.set(pile.id, imgs);
      }
      const n = Math.min(3, pile.n);
      while (imgs.length < n) imgs.push(placeFrame(this.w, fk('power-cell'), 'world', 0, 0));
      while (imgs.length > n) imgs.pop()!.img.destroy();
      const s = this.w.camera.worldToScreen(pile.x, pile.y);
      imgs.forEach((a, i) =>
        a.img
          .setPosition(s.sx + (i - (n - 1) / 2) * 12, s.sy - (i % 2) * 4)
          .setDepth(s.sy + i * 0.001),
      );
    }
    for (const [id, imgs] of this.piles) {
      if (live.has(id)) continue;
      for (const a of imgs) a.img.destroy();
      this.piles.delete(id);
    }
  }

  /** Red danger markers on the ground (boss telegraphs, §3.6), filling as they land. */
  private drawMarkers(w: World) {
    for (const m of w.markers) {
      const s = this.w.camera.worldToScreen(m.x, m.y);
      const { rx, ry } = this.w.camera.groundEllipse(m.r);
      const u = Math.min(
        1,
        Math.max(0, (w.tick - m.createdAt) / Math.max(1, m.landsAt - m.createdAt)),
      );
      this.ground
        .lineStyle(3, theme.color.danger.num, 0.9)
        .strokeEllipse(s.sx, s.sy, rx * 2, ry * 2);
      this.ground
        .fillStyle(theme.color.danger.num, 0.18 + 0.25 * u)
        .fillEllipse(s.sx, s.sy, rx * 2 * u, ry * 2 * u);
    }
  }

  /** Debug panel overlays (§9.5): hitboxes, ranges and flow-field arrows. */
  private drawOverlays(w: World, f: FrameInput) {
    const g = this.debug;
    const marks = this.w.marks;
    const cam = this.w.camera;
    const units = [...w.players, ...w.enemies, ...w.structures];
    if (f.overlays.hitbox) {
      for (const u of units) {
        const s = cam.worldToScreen(u.x, u.y);
        marks.hitbox(s.sx, s.sy, u.r);
      }
      const b = cam.worldToScreen(w.base.x, w.base.y);
      marks.hitbox(b.sx, b.sy, w.base.r);
    }
    if (f.overlays.range) {
      for (const p of w.players) {
        const def = this.content.characters.find((c) => c.id === p.classId);
        const s = cam.worldToScreen(p.x, p.y);
        if (def) marks.hitbox(s.sx, s.sy, def.main.range, theme.color.amber.num);
      }
      for (const st of w.structures) {
        const def = this.content.structures.find((d) => d.id === st.kind);
        const s = cam.worldToScreen(st.x, st.y);
        if (def?.attack) marks.hitbox(s.sx, s.sy, def.attack.range, theme.color.amber.num);
      }
      const archers = this.content.base?.archers;
      if (archers) {
        for (const a of archers.at.slice(0, w.base.archers.count)) {
          const s = cam.worldToScreen(a.x, a.y);
          marks.hitbox(s.sx, s.sy, archers.attack.range, theme.color.ember.num);
        }
      }
    }
    if (f.overlays.flow) {
      const field = w.fields.ground;
      g.lineStyle(1.5, theme.color.hostile.num, 0.7);
      for (let i = 0; i < field.next.length; i++) {
        const n = field.next[i]!;
        if (n < 0) continue;
        const c0 = i % field.cols;
        const r0 = Math.floor(i / field.cols);
        const c1 = n % field.cols;
        const r1 = Math.floor(n / field.cols);
        const a = cam.worldToScreen(c0 + 0.5, r0 + 0.5);
        const b = cam.worldToScreen(lerp(c0, c1, 0.45) + 0.5, lerp(r0, r1, 0.45) + 0.5);
        g.lineBetween(a.sx, a.sy, b.sx, b.sy);
        g.fillStyle(theme.color.hostile.num, 0.8).fillCircle(b.sx, b.sy, 1.8);
      }
    }
  }

  destroy() {
    for (const k of this.knights.values()) {
      k.rig.destroy();
      k.tag.destroy();
    }
    for (const [id, en] of this.enemies) this.dropEnemy(id, en);
    this.structs.destroy();
    for (const s of this.shots.values()) s.release();
    this.support.destroy();
    this.knights.clear();
    this.shots.clear();
    this.launches.clear();
    this.launchers.clear();
    this.enemyShots.clear();
  }
}

function looksOf(effects: readonly { def: EffectId }[]): StatusLook[] {
  const out: StatusLook[] = [];
  for (const e of effects) {
    const l = LOOK_OF[e.def];
    if (l && !out.includes(l)) out.push(l);
  }
  return out;
}

/**
 * Straight shots are bolts; the Quartermaster's are nanite bolts (FF9), enemies' their own (FF10);
 * mortars lob shells (FF8).
 */
function projectileKind(from: string): ProjectileKind {
  if (from === 'quartermaster') return 'nanite-bolt';
  if (from === 'flyer') return 'wasp-shot';
  if (from === 'siege') return 'bombard-shell';
  if (from === 'bomb_tower') return 'mortar-shell';
  return 'bolt';
}

/** About how far (x, y) is from the Citadel (tiles): its center less half its short side. */
function rectDistToBase(w: World, x: number, y: number): number {
  const b = w.base;
  return Math.max(0, Math.hypot(x - b.x, y - b.y) - b.r);
}
