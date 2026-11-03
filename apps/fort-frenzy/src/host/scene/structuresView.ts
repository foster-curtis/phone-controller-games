// Structures drawn from sim state (SPEC §7, §7.1, §7.2; FF8): pulse turrets and mortars (aim, fire,
// tiers, damaged, Fortify with its ripple), walls (16-mask autotiles with rails, damaged cracks and
// flicker, the charged overlay once Charged walls is bought), shock nets (joined field, each tile
// dimming as its discharges run out and flashing on each one), the build sketch and fill, the
// destroyed collapse into scrap, mortar shells leaving from the barrel and bursting in a blast ring,
// and Mason's sparks from the Warden's hammer to the walls he repairs. The sim is read, never written.
// Per frame: alpha, crop and scale only; fields rebuild only when their tiles or states change.
import type { Content } from '../../content';
import type { ArtImage } from '../render/atlas';
import { Mortar, NetField, PulseTurret, WallField, type WallTile } from '../render/structures';
import { BuildFill, Collapse } from '../render/buildFx';
import { structureScrap } from '../render/structureFx';
import type { ScreenPoint, TowerTier } from '../render/types';
import type { RenderWorld } from '../render/world';
import { SHELL_LAUNCH_Z } from '../sim/structures/mortar';
import type { EntityId, PlayerEnt, ProjectileEnt, SimEvent, World } from '../sim/types';
import { anchorToWorld, type Pos } from './shot';

/** Mason sparks per damaged wall in reach, ms apart. */
const MASON_EVERY_MS = 480;
/** Spark height above a wall tile's center (its panel), tiles. */
const WALL_TOP_Z = 0.55;

const screenRot = (a: number) => Math.atan2(Math.sin(a) * 0.6, Math.cos(a));
const tierOf = (n: number | undefined) => Math.min(3, n ?? 0) as TowerTier;

interface Known {
  kind: string;
  tile: readonly [number, number];
}

export class StructuresView {
  private readonly turrets = new Map<EntityId, PulseTurret>();
  private readonly mortars = new Map<EntityId, Mortar>();
  private readonly walls: WallField;
  private readonly nets: NetField;
  private wallSig = '';
  private netSig = '';
  private readonly known = new Map<EntityId, Known>();
  private fills: BuildFill[] = [];
  private collapses: Collapse[] = [];
  private readonly shells = new Map<
    EntityId,
    { to: { x: number; y: number }; r: number; at: number }
  >();
  private readonly mason = new Map<EntityId, number>();
  private t = 0;

  constructor(
    private readonly w: RenderWorld,
    private readonly content: Content,
  ) {
    this.walls = new WallField(w);
    this.nets = new NetField(w);
  }

  // ---- sync ---------------------------------------------------------------------------------------

  /** New and gone structures; `events` are this frame's (destroyed ones collapse, fizzled nets fade). */
  sync(world: World, events: readonly SimEvent[]) {
    const destroyed = new Set<EntityId>();
    for (const e of events) if (e.e === 'destroyed') destroyed.add(e.id);
    const live = new Set<EntityId>();
    const shop = world.team.shop;
    const turretTier = tierOf(shop.arrow_rate);
    const mortarTier = tierOf(shop.bomb_radius);
    const charged = (shop.spiked_walls ?? 0) > 0;
    const walls: (WallTile & { id: EntityId })[] = [];
    const nets: { c: number; r: number; id: EntityId }[] = [];
    for (const st of world.structures) {
      live.add(st.id);
      this.known.set(st.id, { kind: st.kind, tile: st.tile });
      const damaged = st.damageable && st.hp < st.maxHp * 0.5;
      const [c, r] = st.tile;
      if (st.kind === 'arrow_tower') {
        let t = this.turrets.get(st.id);
        if (!t) {
          t = new PulseTurret(this.w, c + 0.5, r + 0.5);
          this.turrets.set(st.id, t);
        }
        t.setTier(turretTier);
        t.setDamaged(damaged);
        t.setFortify(st.fortified);
        // The Artificer's super buff (FF9): shield pips on the plate.
        t.setDefenseBonus(st.effects.some((x) => x.def === 'tower_defense'));
      } else if (st.kind === 'bomb_tower') {
        let m = this.mortars.get(st.id);
        if (!m) {
          m = new Mortar(this.w, this.w.rig('mortar'), c + 0.5, r + 0.5);
          m.aimScreen(0, -1);
          this.mortars.set(st.id, m);
        }
        m.setTier(mortarTier);
        m.setDamaged(damaged);
        m.setFortify(st.fortified);
      } else if (st.kind === 'wall') {
        walls.push({ id: st.id, c, r, damaged, charged });
      } else if (st.kind === 'snare') {
        nets.push({ id: st.id, c, r });
      }
    }
    for (const [id, t] of this.turrets) {
      if (live.has(id)) continue;
      if (destroyed.has(id)) this.collapse('arrow_tower', t.images(), t.sx, t.sy);
      t.destroy();
      this.turrets.delete(id);
    }
    for (const [id, m] of this.mortars) {
      if (live.has(id)) continue;
      if (destroyed.has(id)) {
        m.rig.setUnlit(true);
        this.collapse('bomb_tower', m.images(), m.sx, m.sy);
      }
      m.destroy();
      this.mortars.delete(id);
    }
    const wallSig =
      walls.map((x) => `${x.c},${x.r},${x.damaged ? 1 : 0}`).join(';') + `|${charged}`;
    if (wallSig !== this.wallSig) {
      // Collapse the destroyed walls from their current images before the field is rebuilt.
      for (const id of destroyed) {
        const k = this.known.get(id);
        if (k?.kind !== 'wall') continue;
        const s = this.w.camera.worldToScreen(k.tile[0] + 0.5, k.tile[1] + 0.5);
        this.collapse('wall', this.walls.at(k.tile[0], k.tile[1]), s.sx, s.sy);
      }
      this.walls.set(walls);
      this.wallSig = wallSig;
    }
    const netSig = nets.map((x) => `${x.c},${x.r}`).join(';');
    if (netSig !== this.netSig) {
      this.nets.set(nets);
      this.netSig = netSig;
    }
    const max = this.content.structures.find((d) => d.id === 'snare')?.discharges ?? 1;
    for (const st of world.structures) {
      if (st.kind !== 'snare') continue;
      const armed = st.rearmAt === null || world.tick >= st.rearmAt;
      this.nets.setCharge(st.tile[0], st.tile[1], st.discharges ?? 0, max, armed);
    }
    this.syncShells(world);
  }

  /** Mortar shells: a blast ring sized to the blast radius where each one lands (§7.2). */
  private syncShells(world: World) {
    const live = new Set<EntityId>();
    for (const p of world.projectiles) {
      if (!p.arc || p.side !== 'ours') continue;
      live.add(p.id);
      if (!this.shells.has(p.id))
        this.shells.set(p.id, { to: { ...p.arc.to }, r: p.arc.radius, at: p.arc.landsAt });
    }
    for (const [id, s] of this.shells) {
      if (live.has(id)) continue;
      this.shells.delete(id);
      // Cleared at a build phase rather than landed: no blast.
      if (world.tick + 1 < s.at) continue;
      this.w.fx.ring('ours', s.to.x, s.to.y, s.r, 420);
      const p = this.w.camera.worldToScreen(s.to.x, s.to.y);
      this.w.fx.burst('spark-ours', p.sx, p.sy - 6);
    }
  }

  private collapse(kind: string, images: ArtImage[], sx: number, sy: number) {
    if (images.length > 0) this.collapses.push(new Collapse(this.w, images));
    this.w.fx.burst('spark-ours', sx, sy - 18);
    this.w.fx.scrap('ours', structureScrap(kind), sx, sy);
  }

  // ---- events -------------------------------------------------------------------------------------

  /** A structure's attack (aim and fire); true when the source was a structure. */
  attack(e: Extract<SimEvent, { e: 'attack' }>): boolean {
    const turret = this.turrets.get(e.source);
    if (turret) {
      turret.aimAt(e.angle);
      turret.fire(this.w.fx, screenRot(e.angle));
      return true;
    }
    const m = this.mortars.get(e.source);
    if (m) {
      // The tube leans toward the target on screen; shells arc high (±75° clamp).
      m.aimScreen(Math.cos(e.angle), -1);
      m.fire(this.w.fx);
      return true;
    }
    return false;
  }

  event(e: SimEvent, world: World) {
    switch (e.e) {
      case 'damage': {
        const k = this.known.get(e.target);
        if (!k) return;
        const st = world.structures.find((s) => s.id === e.target);
        if (st?.fortified) {
          this.turrets.get(e.target)?.ripple();
          this.mortars.get(e.target)?.ripple();
        }
        // Charged walls strike back at their attacker (§7.2; the damage itself is FF12's).
        if (k.kind === 'wall' && (world.team.shop.spiked_walls ?? 0) > 0 && e.source !== null) {
          const foe = world.enemies.find((x) => x.id === e.source);
          if (foe) {
            const from = this.w.camera.worldToScreen(k.tile[0] + 0.5, k.tile[1] + 0.5, WALL_TOP_Z);
            this.w.fx.wallStrike(from, this.w.camera.worldToScreen(foe.x, foe.y, 0.4));
          }
        }
        return;
      }
      case 'snareDischarge': {
        const k = this.known.get(e.id);
        if (!k) return;
        this.nets.flash(k.tile[0], k.tile[1]);
        const s = this.w.camera.worldToScreen(k.tile[0] + 0.5, k.tile[1] + 0.5);
        this.w.fx.burst('spark-ours', s.sx, s.sy - 4);
        if (e.left === 0) this.w.fx.burst('spark-ours', s.sx, s.sy - 4, 0, 120);
        return;
      }
      default:
        return;
    }
  }

  /** The build sketch and fill on a new structure, after `delayMs` (the builder's tap or reach). */
  built(e: Extract<SimEvent, { e: 'built' }>, delayMs: number) {
    const [c, r] = e.tile;
    if (e.structure === 'fortify') {
      // The dome springs up over the tower with a ripple and sparks.
      const s = this.w.camera.worldToScreen(c + 0.5, r + 0.5);
      this.w.fx.burst('spark-ours', s.sx, s.sy - 30, 0, delayMs);
      this.turrets.get(e.id)?.ripple();
      this.mortars.get(e.id)?.ripple();
      return;
    }
    const turret = this.turrets.get(e.id);
    const mortar = this.mortars.get(e.id);
    const images =
      e.structure === 'wall'
        ? () => this.walls.at(c, r)
        : e.structure === 'snare'
          ? () => this.nets.at(c, r)
          : turret
            ? () => turret.images()
            : mortar
              ? () => mortar.images()
              : null;
    if (!images) return;
    this.fills.push(new BuildFill(this.w, images, mortar?.rig ?? null, delayMs));
  }

  // ---- per frame ----------------------------------------------------------------------------------

  /** Shell launch point (FF8: from the mortar's barrel, not its plate), as a launch origin offset. */
  shellOrigin(p: ProjectileEnt): Pos | null {
    const m = this.mortars.get(p.source);
    const at = m?.muzzle();
    if (!m || !at || !p.arc) return null;
    const o = anchorToWorld(at, p.arc.from, this.w.camera);
    // `shotPos` adds the origin's height on top of the sim's, which already starts at the muzzle.
    return { ...o, z: o.z - SHELL_LAUNCH_Z };
  }

  update(world: World, dtMs: number, hammerOf: (p: PlayerEnt) => ScreenPoint | null) {
    this.t += dtMs;
    this.walls.update(dtMs);
    this.nets.update(dtMs);
    for (const t of this.turrets.values()) t.update(dtMs);
    for (const m of this.mortars.values()) m.update(dtMs);
    this.fills = this.fills.filter((f) => f.update(dtMs));
    this.collapses = this.collapses.filter((c) => c.update(dtMs));
    if (world.phase === 'combat') this.masonSparks(world, hammerOf);
    for (const id of this.known.keys())
      if (!world.structures.some((s) => s.id === id)) this.known.delete(id);
  }

  /**
   * Mason (§7.2): amber sparks fly from the Warden's hammer to each damaged wall he repairs (the
   * sim's repair radius); the cracks seal as the wall passes half HP.
   */
  private masonSparks(world: World, hammerOf: (p: PlayerEnt) => ScreenPoint | null) {
    for (const p of world.players) {
      if (p.classId !== 'warden' || p.respawnAt !== null || !p.connected) continue;
      const def = this.content.characters.find((c) => c.id === p.classId);
      const radius = Number(def?.passive.params?.radius ?? 2.5);
      for (const st of world.structures) {
        if (st.kind !== 'wall' || st.hp >= st.maxHp) continue;
        if (Math.hypot(st.x - p.x, st.y - p.y) > radius) continue;
        const next = this.mason.get(st.id) ?? this.t + (st.id % 5) * 60;
        if (this.t < next) {
          this.mason.set(st.id, next);
          continue;
        }
        this.mason.set(st.id, this.t + MASON_EVERY_MS);
        const from = hammerOf(p);
        const to = this.w.camera.worldToScreen(st.x, st.y, WALL_TOP_Z);
        if (from) this.w.fx.tracer('ours', from, to, 140);
        this.w.fx.burst('spark-ours', to.sx, to.sy);
      }
    }
    for (const id of this.mason.keys())
      if (!world.structures.some((s) => s.id === id && s.hp < s.maxHp)) this.mason.delete(id);
  }

  destroy() {
    for (const t of this.turrets.values()) t.destroy();
    for (const m of this.mortars.values()) m.destroy();
    for (const f of this.fills) f.destroy();
    this.walls.destroy();
    this.nets.destroy();
    this.turrets.clear();
    this.mortars.clear();
    this.fills = [];
  }
}
