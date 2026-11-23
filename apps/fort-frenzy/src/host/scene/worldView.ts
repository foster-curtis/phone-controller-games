// The run drawn from sim state (SPEC §15.2) through the renderer in render/: the map and portals, the
// Citadel with sentries and damage stages, knights (rings with the aim notch,
// the amber super-ready pulse, nametags and HP bars that flip below near the top, aim previews, the
// Ranger's shot (draw, hold, release; the bolt leaves from the bow), super
// down piles and respawns), enemies (walk, attack, hit and
// death clips; stun forces idle; FF10: tell glows, the Skitter's core throb, the Stalker's target
// flash (C3), Wasp hover over its shadow, mites at their own sizes and paces, shots from the weapon,
// burn/poison tick flashes), projectiles,
// danger markers and the debug overlays. Positions are lerped between the last two sim steps; the
// sim is read, never written.
import { lerp } from '@pcg/game-kit';
import type * as Phaser from 'phaser';
import type { Content } from '../../content';
import type { ClassId, EffectId } from '../../shared/ids';
import { theme } from '../../shared/theme';
import type { ArtImage } from '../render/atlas';
import { drawBowString } from '../render/bowString';
import { pickFacing, enemyMirror, type Facing } from '../render/aim';
import { KNIGHT_DOWN } from '../render/clipKit';
import { ATTACK_MS } from '../render/clips/ranger';
import { enemyBarWidth, enemyHasHpBar, hpBarShown } from '../render/buildLook';
import { clipLandedMs, spawnPile } from '../render/fall';
import { HpBar } from '../render/hpBar';
import { RIG_INFO, type RigInfo } from '../render/gallery/rigInfo';
import { iconFrame, SHOCKWAVE_GROW, SHOCKWAVE_R } from '../render/keys';
import { TILE_W } from '../render/camera';
import { DANGER_EDGE } from '../render/legibility';
import { MapView } from '../render/map';
import { mitePack } from '../render/swarm';
import type { RigSprite } from '../render/rig';
import { locomotionClip, locomotionSpeed, StatusSprites } from '../render/status';
import { Citadel, type SentryId } from '../render/structures';
import type { IconKey, ProjectileKind, ProjectileSprite, StatusLook } from '../render/types';
import type { RenderWorld } from '../render/world';
import {
  aimPreview,
  buildPreview,
  groundBody,
  shieldOf,
  soldierPreview,
  steadyOn,
  superHeld,
  type GroundBody,
} from '../sim';
import { BuildsView } from './buildsView';
import {
  BASE_ID,
  STEP_MS,
  type EnemyEnt,
  type EntityId,
  type PlayerEnt,
  type DangerMarker,
  type SimEvent,
  type World,
} from '../sim/types';
import {
  BRUTE_CUE_MS,
  bruteArrowLift,
  bruteCueScale,
  chargeLevel,
  drawGlow,
  enemyShotPos,
  huntFlashLevel,
  laneQuad,
  pulseHz,
  pulseLevel,
  TELL_GLOW,
  type EnemyShot,
} from './enemyFx';
import { drawAimPreview, drawThrowPreview, type GroundFrame } from './aimPreview';
import { ColossusView } from './colossusView';
import { lerpGround, lerpPos } from './interp';
import { anchorToWorld, shotPos, shotTiming, type Launch, type Pos } from './shot';
import { shotAnchor } from './support';
import { SupportView } from './supportView';
import { superPulse } from './superPulse';
import { syncTag, type TagState } from './tag';
import { wardenAttack, type WardenImpact } from './wardenFx';

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

/** Map v1 anchor (SPEC §15.2): the Citadel's front-center. */
const CITADEL_AT = { x: 18, y: 2 };
/** Knights near the top edge (by the Citadel) get their label below the sprite (§2.1). */
const FLIP_BELOW_Y = 4;
const ONE_SHOTS = new Set(['attack', 'super', 'build', 'hit', 'respawn', 'throw', 'plant']);
/** How long a shot keeps the Ranger facing and in his `ready` pose, ms: the whole attack clip. */
const SHOT_HOLD_MS = ATTACK_MS + 20;

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
  /** Overflow shield (§6.1, FF12): the icon beside the HP bar while a shield holds. */
  overflow: ArtImage;
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
  /** Violet HP bar, made on the first hit and shown only while damaged (§2.6); none for mites. */
  bar: HpBar | null;
  /** Brute (RD10): the `huntSince` whose cue already played. */
  lockSeen?: number;
}

interface Timer {
  at: number;
  fn: () => void;
}

export class WorldView {
  /** The Artificer, the Commander and his squad (FF9). */
  private readonly support: SupportView;
  private readonly citadel: Citadel;
  /** The map's portals flare ahead of a spawn (§3.1). */
  private readonly map: MapView;
  /** Builds: flight, active, damaged, wreck and scrap (§7.5, RD5). */
  private readonly builds: BuildsView;
  private readonly knights = new Map<number, Knight>();
  private readonly enemies = new Map<EntityId, Enemy>();
  /** The Colossus's tiers, attack clips, tells, core and shockwaves (FF11). */
  private readonly boss: ColossusView;
  private readonly shots = new Map<EntityId, ProjectileSprite>();
  private readonly launches = new Map<EntityId, Launch>();
  private readonly launchers = new Map<EntityId, Knight>();
  private readonly enemyShots = new Map<EntityId, EnemyShot>();
  private readonly ui: Phaser.GameObjects.Graphics;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly debug: Phaser.GameObjects.Graphics;
  /** Enemy tells and the Skitter core throb (effects layer, so the bloom takes them). */
  private readonly glow: Phaser.GameObjects.Graphics;
  private timers: Timer[] = [];
  /** The Warden's pending impacts, by `source:slot`, so a cut-short wind-up can call its off. */
  private readonly wardenImpacts = new Map<string, WardenImpact>();
  /** Reused by the aim previews each frame. */
  private readonly aimFrame: GroundFrame = { sx: 0, sy: 0, kx: 0, ky: 0 };
  private t = 0;
  /** Enemy body hitboxes on the ground (the sim's, for the hitbox overlay). */
  private readonly bodies: Map<string, GroundBody>;

  constructor(
    private readonly w: RenderWorld,
    private readonly content: Content,
  ) {
    this.bodies = new Map(
      content.enemies.flatMap((e) => (e.body ? [[e.id, groundBody(e.body)] as const] : [])),
    );
    this.map = new MapView(w, w.theme.map);
    this.builds = new BuildsView(w, content);
    this.citadel = new Citadel(w, CITADEL_AT.x, CITADEL_AT.y);
    this.support = new SupportView(w, content, (slot) => this.knights.get(slot) ?? null);
    this.boss = new ColossusView(w);
    const gfx = (layer: 'groundOverlay' | 'worldUi' | 'effects', depth: number) => {
      const g = w.scene.make.graphics({}, false).setDepth(depth);
      w.layers[layer].add(g);
      return g;
    };
    this.ground = gfx('groundOverlay', -5e5);
    this.ui = gfx('worldUi', -1);
    this.debug = gfx('worldUi', 1e6);
    this.glow = gfx('effects', 1e6);
  }

  /** Dev fallback shapes drawn (e2e asserts none). */
  get fallbacks(): number {
    return this.w.lib.fallbacks;
  }

  private later(ms: number, fn: () => void) {
    this.timers.push({ at: this.t + ms, fn });
  }

  private screen(id: EntityId, x: number, y: number, z: number, f: FrameInput) {
    const p = lerpPos(f.prev.get(id), x, y, z, f.alpha);
    return { ...p, ...this.w.camera.worldToScreen(p.x, p.y, p.z) };
  }

  /** The lerped ground point under a body, whatever its sim height (C3: the Wasp's jitter). */
  private groundAt(id: EntityId, x: number, y: number, f: FrameInput) {
    const p = lerpGround(f.prev.get(id), x, y, f.alpha);
    return { ...p, ...this.w.camera.worldToScreen(p.x, p.y, 0) };
  }

  update(f: FrameInput) {
    this.t += f.dtMs;
    const due = this.timers.filter((x) => x.at <= this.t);
    if (due.length > 0) {
      this.timers = this.timers.filter((x) => x.at > this.t);
      for (const d of due) d.fn();
    }
    const w = f.world;
    this.syncKnights(w);
    this.syncEnemies(w);
    for (const e of f.events) {
      this.event(e, w);
    }
    this.ground.clear();
    this.ui.clear();
    this.debug.clear();
    this.glow.clear();
    this.w.marks.begin();
    this.drawCitadel(w, f.dtMs);
    this.drawKnights(w, f);
    this.builds.update(w, w.tick - 1 + f.alpha, f.dtMs);
    this.support.update(f);
    this.boss.begin(f.dtMs);
    this.drawEnemies(w, f);
    this.boss.frame(w, (id) => this.enemies.get(id)?.rig ?? null);
    this.drawProjectiles(w, f);
    this.drawMarkers(w);
    if (f.overlays.hitbox || f.overlays.range || f.overlays.flow) this.drawOverlays(w, f);
    this.w.update(f.dtMs);
    for (const k of this.knights.values()) drawBowString(k.rig);
  }

  // ---- entity lifecycles ----------------------------------------------------------------------------

  private rigFor(classId: ClassId) {
    return classId; // a knight's rig id is its class id
  }

  private icon(id: string, layer: 'worldUi' = 'worldUi', size = 0.8): ArtImage {
    const a = this.w.lib.image(iconFrame(id as IconKey), [12, 12]);
    this.w.lib.setUnitScale(a, size * 1.6);
    a.img.setVisible(false);
    this.w.layers[layer].add(a.img);
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
        overflow: this.icon('overflow-shield'),
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
        bar: null,
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
    en.bar?.destroy();
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
    this.builds.event(e, w);
    switch (e.e) {
      case 'buildPlaced': {
        // He kneels and sets the mine (§2.4); the mine's own view does the rest.
        const k = this.knights.get(e.slot);
        if (e.kind === 'mine' && k && !k.down) k.rig.play('build', { restart: true, fadeMs: 40 });
        return;
      }
      case 'portalFlare': {
        const ms = this.content.rules?.flareMs ?? 1000;
        this.map.flare(e.portal, ms);
        this.later(ms, () => this.map.idle(e.portal));
        return;
      }
      case 'attack':
        return this.attack(e, w);
      case 'windupCancelled': {
        const key = `${e.source}:${e.slot}`;
        const impact = this.wardenImpacts.get(key);
        if (impact) impact.cancelled = true;
        this.wardenImpacts.delete(key);
        // Out of the jump at once; a knight going down plays `down` from its own event next.
        const k = this.knightById(e.source);
        if (k && !k.down) k.rig.play('idle', { restart: true, fadeMs: 120 });
        return;
      }
      case 'damage': {
        const en = this.enemies.get(e.target);
        if (en && !en.dying) {
          // A burn or poison tick is only the white flash (art README: status effects).
          if (e.kind === 'dot') {
            en.rig.flash(60);
            return;
          }
          if ((!playing(en.rig) || en.rig.clip === 'hit') && !this.boss.holds(en.rig))
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
    const en = this.enemies.get(e.source);
    if (en && !en.dying) {
      en.mirror = enemyMirror(Math.cos(e.angle), en.mirror);
      // The Colossus's attacks play from its boss state (colossusView.ts, FF11).
      if (en.rig.rigId === 'colossus') return;
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
      const def = this.content.knights.find((c) => c.id === p.classId);
      if (def) {
        const impact = wardenAttack(this.w, k.rig, e, def, (ms, fn) => this.later(ms, fn));
        this.wardenImpacts.set(`${e.source}:${e.slot}`, impact);
      }
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
      const def = this.content.knights.find((c) => c.id === p.classId);
      const shape = def ? aimPreview(p, def, 'super', this.content.rules) : null;
      if (p.classId === 'ranger' && shape?.kind === 'circle') {
        // The `shockwave` frame rolls out and ends exactly on the hit circle, cards included (§2.4).
        const at = this.w.camera.worldToScreen(e.x, e.y);
        const full = this.w.camera.groundEllipse(shape.radius).rx / (SHOCKWAVE_R * this.w.unitPx);
        fx.mark?.('shockwave', at.sx, at.sy, 520, full / SHOCKWAVE_GROW);
      } else {
        fx.ring('ours', e.x, e.y, def?.super.radius ?? def?.super.range ?? 3, 520);
      }
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
    // In the jump slam he holds the aim he jumped along (§8.2), whatever the sticks do.
    if (p.super.windupEndsAt !== null) return k.shotAngle;
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
        // Steady Aim (only with the card, RD7) blends into `ready`; a shot snaps to it (§15.2 poses).
        const steady = w.phase === 'combat' && steadyOn(p);
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

      // Ground: shadow, ring with the aim notch (§2.4). Super ready pulses the
      // ring with amber light (§10.1, C2), under the colored ring so the player color stays on top.
      const ring = k.info.ring ?? 0.68;
      marks.shadow(at.sx, at.sy, k.info.shadow[0] * 2, k.info.shadow[1] * 2);
      if (!k.down) {
        const pulse = superPulse(p, this.t, superHeld(w, p, this.content));
        if (pulse) marks.superRing(at.sx, at.sy, ring, pulse.color, pulse.scale, pulse.alpha);
        marks.ring(at.sx, at.sy, ring, color, this.aimOf(p, k) ?? p.facing);
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
    // Overflow shield: its icon beside the HP bar, no world sprite (§6.1, FF12).
    const shielded = p.respawnAt === null && shieldOf(p) > 0;
    k.overflow.img.setVisible(shielded);
    if (shielded) k.overflow.img.setPosition(at.sx + 23 + 9, below ? tagY + 26 : tagY + 5);
    this.drawAim(w, p, at);
  }

  /**
   * Aim previews while an aimed button is held (§10.1: drawn on the TV, not the phone; C3): the
   * attack's real hit area from the sim's effective stats. A super shows only once it can fire.
   */
  private drawAim(w: World, p: PlayerEnt, at: { x: number; y: number }) {
    // Nothing can be aimed from the air (§8.2).
    if (p.respawnAt !== null || p.super.windupEndsAt !== null) return;
    const def = this.content.knights.find((c) => c.id === p.classId);
    if (!def) return;
    this.drawThrowAim(p, at);
    for (const slot of ['main', 'super'] as const) {
      const aim = slot === 'main' ? p.mainAim : p.superAim;
      if (!aim || (aim.x === 0 && aim.y === 0)) continue;
      if (slot === 'super' && p.superCharge < 1) continue;
      const f = this.aimFrame;
      const s = this.w.camera.worldToScreen(at.x, at.y);
      const e = this.w.camera.groundEllipse(1);
      f.sx = s.sx;
      f.sy = s.sy;
      f.kx = e.rx;
      f.ky = e.ry;
      // Reinforcements shows where the soldier lands; at the squad cap it can't fire (§8.4, §10.1).
      if (slot === 'super' && def.super.spawn) {
        const pv = superHeld(w, p, this.content) ? null : soldierPreview(p, this.content);
        if (pv) drawThrowPreview(this.ground, pv, f, theme.color.amber.num);
        continue;
      }
      const shape = aimPreview(p, def, slot, this.content.rules);
      // A single bolt's bar is its hitbox wide (C4): the sim's projectile radius, from content.
      drawAimPreview(
        this.ground,
        shape,
        f,
        Math.atan2(aim.y, aim.x),
        theme.color.amber.num,
        this.content.rules?.projectileRadius ?? 0,
      );
    }
  }

  /**
   * A thrown build's landing preview (§7.3, §10.1; RD5): its 0.6 ground ellipse at the build's real
   * effect radius plus the throw range around the knight, only while the button can place (meter full).
   */
  private drawThrowAim(p: PlayerEnt, at: { x: number; y: number }) {
    if (!p.buildAim || p.meter < 1) return;
    const pv = buildPreview(p, this.content);
    if (!pv) return;
    const f = this.aimFrame;
    const s = this.w.camera.worldToScreen(at.x, at.y);
    const e = this.w.camera.groundEllipse(1);
    f.sx = s.sx;
    f.sy = s.sy;
    f.kx = e.rx;
    f.ky = e.ry;
    drawThrowPreview(this.ground, pv, f, theme.color.amber.num);
  }

  private drawEnemies(w: World, f: FrameInput) {
    const byId = new Map<EntityId, EnemyEnt>(w.enemies.map((e) => [e.id, e]));
    for (const [id, en] of this.enemies) {
      const e = byId.get(id);
      if (en.dying) {
        en.bar?.hide();
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
      // stays (§2.5 height, §9.6), so the sim's z isn't drawn (nor lerped: C3, interp.ts).
      const at = this.groundAt(id, e.x, e.y, f);
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
      // Stunned units always idle (C1 note 11); slowed ones walk sluggishly. The Colossus picks its
      // own clips from its boss state (FF11).
      if (e.boss) this.boss.update(e, en.rig, moving, locomotionSpeed(looks), f.dtMs, w);
      else if (!playing(en.rig) || stunned)
        en.rig.play(locomotionClip(moving, looks), {
          speed: locomotionSpeed(looks) * en.clipSpeed,
        });
      en.status?.update(f.dtMs, at.sx, at.sy - fly);
      const k = fly > 0 ? 0.75 : 1; // the shadow far below reads smaller
      this.w.marks.shadow(at.sx, at.sy, en.info.shadow[0] * 2 * k, en.info.shadow[1] * 2 * k);
      if (!stunned) this.drawEnemyLooks(w, e, en, f.dtMs);
      this.drawEnemyBar(e, en, fly);
    }
  }

  /**
   * The violet HP bar above a damaged enemy (§2.6, RD5): hidden at full HP, none for Scrap mites, the
   * Colossus keeps its bottom-edge bar. Width follows the enemy's size; made once, moved and scaled.
   */
  private drawEnemyBar(e: EnemyEnt, en: Enemy, fly: number) {
    if (!enemyHasHpBar(en.rig.rigId, !!e.boss) || !hpBarShown(e.hp, e.maxHp)) {
      en.bar?.hide();
      return;
    }
    en.bar ??= new HpBar(
      this.w,
      theme.color.hostile.num,
      enemyBarWidth(en.info.hitbox, TILE_W * this.w.camera.scale),
    );
    const top = en.rig.attach('top');
    const y = (top?.sy ?? en.sy - fly - en.info.bodyH * this.w.unitPx) - 10;
    en.bar.set(top?.sx ?? en.sx, y, e.hp / e.maxHp);
  }

  /** Tell glows, the Skitter's core throb and the Stalker's target flash (FF10, C3, §9.6). */
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
    if (rigId === 'stalker' && e.hunting !== null && e.locked && e.huntSince !== undefined) {
      // RD10: the quarry's color flashes at the quarry's feet for ~2 s from the lock-on, sim time.
      const level = huntFlashLevel((w.tick - e.huntSince) * STEP_MS);
      const q = level > 0 ? w.players.find((p) => p.slot === e.hunting) : undefined;
      if (q) {
        const color = theme.players[q.color].fill.num;
        const at = this.w.camera.worldToScreen(q.x, q.y);
        const { rx, ry } = this.w.camera.groundEllipse(Math.max(0.45, q.r * 1.4));
        const sw = theme.stroke.ring;
        this.ground
          .lineStyle(sw * 3, color, 0.3 * level)
          .strokeEllipse(at.sx, at.sy, rx * 2 + sw * 2, ry * 2 + sw * 1.2)
          .lineStyle(sw, color, level)
          .strokeEllipse(at.sx, at.sy, rx * 2, ry * 2);
      }
    }
    if (rigId === 'brute' && e.huntSince !== undefined && e.huntSince !== en.lockSeen) {
      // RD10: the violet cue on the build it just locked on to: ring under it, arrow above it.
      en.lockSeen = e.huntSince;
      const b = w.builds.find((x) => x.id === e.huntBuild);
      if (b) {
        const at = this.w.camera.worldToScreen(b.x, b.y);
        this.w.fx.mark?.('brute-target', at.sx, at.sy, BRUTE_CUE_MS, bruteCueScale(b.r));
        const up = bruteArrowLift(b.kind) * k1;
        this.w.fx.mark?.('brute-target-arrow', at.sx, at.sy - up, BRUTE_CUE_MS);
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
        launch = { bornMs: this.t, delayMs, origin: null };
        this.launches.set(pr.id, launch);
        if (k) this.launchers.set(pr.id, k);
      }
      if (this.t - launch.bornMs < launch.delayMs) continue;
      // The release: read the origin off the bow once.
      const k = this.launchers.get(pr.id);
      if (k) {
        this.launchers.delete(pr.id);
        const m = k.down ? null : k.rig.attach(shotAnchor(k.rig.rigId));
        if (m) {
          launch.origin = anchorToWorld(m, { x: k.wx, y: k.wy }, this.w.camera);
          // The nanite blast flashes at the lens with each nanite (§2.4).
          if (pr.from === 'artificer')
            this.w.fx.burst('muzzle-ours', m.sx, m.sy, screenRot(Math.atan2(pr.vy, pr.vx)));
        }
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
      // The Colossus's boulder leaves its near fist (FF11), with no muzzle flash.
      const boulder = en?.rig.rigId === 'colossus';
      const m = en && !en.dying ? en.rig.attach(boulder ? 'fist-near' : 'muzzle') : null;
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
      if (m && !boulder)
        this.w.fx.burst('muzzle-theirs', m.sx, m.sy, screenRot(Math.atan2(pr.vy, pr.vx)));
    }
    return enemyShotPos(s, this.t, sim);
  }

  /** Red danger markers on the ground (boss telegraphs, §3.6), filling as they land. */
  private drawMarkers(w: World) {
    for (const m of w.markers) {
      // Shockwave rings are the Colossus's rolling violet outline (colossusView.ts), not red fills.
      if (m.shape === 'ring') continue;
      if (m.shape === 'lane') {
        this.drawLane(w, m);
        continue;
      }
      const s = this.w.camera.worldToScreen(m.x, m.y);
      const { rx, ry } = this.w.camera.groundEllipse(m.r);
      const u = Math.min(
        1,
        Math.max(0, (w.tick - m.createdAt) / Math.max(1, m.landsAt - m.createdAt)),
      );
      // Ink edge under the red ring (FF3-fix-2): red is near the lighter floor's luminance (C3).
      this.ground
        .lineStyle(3 + DANGER_EDGE.px * 2, theme.color.brandInk.num, DANGER_EDGE.alpha)
        .strokeEllipse(s.sx, s.sy, rx * 2, ry * 2);
      this.ground
        .lineStyle(3, theme.color.danger.num, 0.9)
        .strokeEllipse(s.sx, s.sy, rx * 2, ry * 2);
      this.ground
        .fillStyle(theme.color.danger.num, 0.18 + 0.25 * u)
        .fillEllipse(s.sx, s.sy, rx * 2 * u, ry * 2 * u);
    }
  }

  /** The Charge's red lane (§9.2, RD10): its full path outlined, filling from the Colossus out. */
  private drawLane(w: World, m: DangerMarker) {
    const lane = { x: m.x, y: m.y, x2: m.x2 ?? m.x, y2: m.y2 ?? m.y, r: m.r };
    const u = Math.min(
      1,
      Math.max(0, (w.tick - m.createdAt) / Math.max(1, m.landsAt - m.createdAt)),
    );
    const cam = this.w.camera;
    const [ax, ay, bx, by, cx, cy, dx, dy] = laneQuad(lane, 1);
    const a = cam.worldToScreen(ax, ay);
    const b = cam.worldToScreen(bx, by);
    const c = cam.worldToScreen(cx, cy);
    const d = cam.worldToScreen(dx, dy);
    const edge = (width: number, color: number, alpha: number) => {
      this.ground.lineStyle(width, color, alpha);
      this.ground.lineBetween(a.sx, a.sy, b.sx, b.sy);
      this.ground.lineBetween(b.sx, b.sy, c.sx, c.sy);
      this.ground.lineBetween(c.sx, c.sy, d.sx, d.sy);
      this.ground.lineBetween(d.sx, d.sy, a.sx, a.sy);
    };
    edge(3 + DANGER_EDGE.px * 2, theme.color.brandInk.num, DANGER_EDGE.alpha);
    edge(3, theme.color.danger.num, 0.9);
    const [, , , , fx, fy, gx, gy] = laneQuad(lane, u);
    const f = cam.worldToScreen(fx, fy);
    const g = cam.worldToScreen(gx, gy);
    this.ground
      .fillStyle(theme.color.danger.num, 0.18 + 0.25 * u)
      .fillTriangle(a.sx, a.sy, b.sx, b.sy, f.sx, f.sy)
      .fillTriangle(a.sx, a.sy, f.sx, f.sy, g.sx, g.sy);
  }

  /** Debug panel overlays (§9.5): hitboxes, ranges and flow-field arrows. */
  private drawOverlays(w: World, f: FrameInput) {
    const g = this.debug;
    const marks = this.w.marks;
    const cam = this.w.camera;
    const units = [...w.players, ...w.enemies];
    if (f.overlays.hitbox) {
      for (const u of units) {
        const s = cam.worldToScreen(u.x, u.y);
        marks.hitbox(s.sx, s.sy, u.r);
      }
      const b = cam.worldToScreen(w.base.x, w.base.y);
      marks.hitbox(b.sx, b.sy, w.base.r);
      // What our attacks hit (C4): each enemy's body, over its feet circle (walking, enemy reach).
      for (const e of w.enemies) {
        const body = this.bodies.get(e.kind);
        if (!body) continue;
        const s = cam.worldToScreen(e.x, e.y);
        marks.bodyHitbox(s.sx, s.sy, body);
      }
    }
    if (f.overlays.range) {
      for (const p of w.players) {
        const def = this.content.knights.find((c) => c.id === p.classId);
        const s = cam.worldToScreen(p.x, p.y);
        if (def) marks.hitbox(s.sx, s.sy, def.main.range, theme.color.amber.num);
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
    for (const s of this.shots.values()) s.release();
    this.support.destroy();
    this.builds.destroy();
    this.boss.destroy();
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
 * Straight shots are bolts; the Artificer's are nanite bolts (FF9), enemies' their own (FF10).
 */
function projectileKind(from: string): ProjectileKind {
  if (from === 'artificer') return 'nanite-bolt';
  if (from === 'flyer') return 'wasp-shot';
  if (from === 'siege') return 'bombard-shell';
  if (from === 'colossus') return 'boulder';
  return 'bolt';
}

/** About how far (x, y) is from the Citadel (tiles): its center less half its short side. */
function rectDistToBase(w: World, x: number, y: number): number {
  const b = w.base;
  return Math.max(0, Math.hypot(x - b.x, y - b.y) - b.r);
}
