// The Colossus on the TV (SPEC §9.2, §9.6; FF11), driven from the boss's sim state on top of the
// enemy drawing in worldView.ts: its Mk I/II/III groups and the final phase's cracked core and
// plumes, the clip for each attack in sync with the sim's wind-up (slam and wall breaker, boulder
// throw, Runner call) and the kneel while staggered, head tracking that snaps to the target before a
// slam or throw, the tells (fist seams flaring through the slam's wind-up, the targeted wall
// flashing, scrap torn up for a boulder, spires surging before Runners launch), the core showing the
// stagger meter, the shockwave rings rolling out of final-phase slams (a violet outline on the
// sim's band, so dodging reads), and impacts where slams and boulders land. The sim is read, never
// written. Graphics are made on first use (FF7-fix-1's frame-cost rule).
import type * as Phaser from 'phaser';
import { theme } from '../../shared/theme';
import {
  COLOSSUS_CALL_MS,
  COLOSSUS_SLAM_MS,
  COLOSSUS_STAGGER_MS,
  COLOSSUS_THROW_MS,
} from '../render/clips/colossus';
import {
  CLIP_OF_ACT,
  COLOSSUS_GROUPS,
  COLOSSUS_ONE_SHOTS,
  colossusGroupsFor,
  coreHz,
  coreLook,
  drawCore,
  easeHead,
  headTarget,
  spiresFor,
} from '../render/colossusLook';
import type { RigSprite } from '../render/rig';
import type { RenderWorld } from '../render/world';
import { STEP_MS, type BossAct, type EnemyEnt, type EntityId, type World } from '../sim/types';
import { chargeLevel, drawGlow } from './enemyFx';
import { Scratch } from './support';

interface Look {
  head: { rot: number; dy: number };
  /** Core throb phase, cycles. */
  pulse: number;
  /** The act whose clip is playing (its start tick), and the one-off effects it already fired. */
  act: number | null;
  fired: Set<string>;
}

/** A batch of shockwave ring markers from one slam: the band rolling out, as the sim lands it. */
interface Wave {
  x: number;
  y: number;
  r0: number;
  band: number;
  n: number;
  stepTicks: number;
  createdAt: number;
}

interface KnownMarker {
  x: number;
  y: number;
  r: number;
  landsAt: number;
  boulder: boolean;
}

/** The scrap grab in the throw clip (render/clips/colossus.ts). */
const GRAB_MS = 300;

export class ColossusView {
  private readonly looks = new Map<EntityId, Look>();
  private readonly markers = new Map<EntityId, KnownMarker>();
  private readonly waves = new Map<string, Wave>();
  private readonly glow: Scratch<Phaser.GameObjects.Graphics>;
  private readonly flash: Scratch<Phaser.GameObjects.Graphics>;
  private t = 0;

  constructor(private readonly w: RenderWorld) {
    this.glow = new Scratch(() => {
      const g = w.scene.make.graphics({}, false).setDepth(1e6 + 1);
      w.layers.effects.add(g);
      return g;
    });
    this.flash = new Scratch(() => {
      const g = w.scene.make.graphics({}, false).setDepth(1e6);
      w.layers.effects.add(g);
      return g;
    });
  }

  /** Starts a frame. */
  begin(dtMs: number): void {
    this.t += dtMs;
    this.glow.begin();
    this.flash.begin();
  }

  /** The Colossus is playing one of its own clips: a hit flashes it but doesn't replace the clip. */
  holds(rig: RigSprite): boolean {
    return (
      rig.rigId === 'colossus' &&
      rig.clip !== null &&
      COLOSSUS_ONE_SHOTS.has(rig.clip) &&
      !rig.clipDone
    );
  }

  private look(id: EntityId): Look {
    let l = this.looks.get(id);
    if (!l) {
      l = { head: { rot: 0, dy: 0 }, pulse: 0, act: null, fired: new Set() };
      this.looks.set(id, l);
    }
    return l;
  }

  /** One living Colossus, each frame (worldView's enemy pass, instead of the locomotion clip). */
  update(e: EnemyEnt, rig: RigSprite, moving: boolean, walkSpeed: number, dtMs: number, w: World) {
    const b = e.boss;
    if (!b) return;
    const l = this.look(e.id);
    const on = colossusGroupsFor(b.mk, b.finalPhase);
    for (const g of COLOSSUS_GROUPS) {
      if (rig.isGroupOn(g) !== on.includes(g)) rig.setGroup(g, on.includes(g));
    }
    const staggered = b.staggeredUntil !== null;
    const act = staggered ? null : (b.act ?? null);

    // Clips, kept in step with the sim's timers.
    if (staggered) {
      if (rig.clip !== 'stagger') {
        const left = (b.staggeredUntil! - w.tick) * STEP_MS;
        rig.play('stagger', {
          restart: true,
          fadeMs: 80,
          offsetMs: Math.max(0, COLOSSUS_STAGGER_MS - left),
        });
      }
      l.act = null;
    } else if (act) {
      const clip = CLIP_OF_ACT[act.kind] ?? 'slam';
      if (l.act !== act.startedAt || rig.clip !== clip) {
        l.act = act.startedAt;
        l.fired.clear();
        rig.play(clip, {
          restart: true,
          fadeMs: 60,
          offsetMs: Math.max(0, (w.tick - act.startedAt) * STEP_MS),
        });
      }
    } else if (!this.holds(rig) && !(rig.clip === 'hit' && !rig.clipDone)) {
      rig.play(moving ? 'walk' : 'idle', { speed: walkSpeed });
    }

    // Head tracking: toward the aim (snapping before a slam or throw), else the way it walks.
    let angle = e.facing;
    if (act) angle = Math.atan2(act.y - e.y, act.x - e.x);
    else if (moving) angle = Math.atan2(e.vy, e.vx);
    easeHead(
      l.head,
      staggered ? { rot: 0, dy: 0 } : headTarget(angle),
      dtMs,
      act !== null && act.kind !== 'call',
    );
    rig.override('head', { rot: l.head.rot, dy: l.head.dy });

    // The core shows the hidden stagger meter.
    const k1 = this.w.unitPx;
    l.pulse += (dtMs / 1000) * coreHz(staggered ? 1 : b.stagger);
    const core = rig.attach('core');
    if (core) {
      drawCore(
        this.glow.draw(),
        core.sx,
        core.sy,
        k1,
        coreLook(b.stagger, staggered, b.finalPhase, l.pulse),
      );
    }
    // Final phase: plumes pour from the spires.
    if (b.finalPhase) {
      for (const [i, s] of spiresFor(b.mk).entries()) {
        const p = rig.attach(s);
        const lvl = 0.35 + 0.2 * Math.sin(this.t * 0.008 + i * 1.7);
        if (p) drawGlow(this.glow.draw(), p.sx, p.sy - 4 * k1, 7 * k1, lvl);
      }
    }
    if (act) this.tells(e, rig, act, w, l);
  }

  private tells(e: EnemyEnt, rig: RigSprite, act: BossAct, w: World, l: Look) {
    const k1 = this.w.unitPx;
    const age = (w.tick - act.startedAt) * STEP_MS;
    const g = this.glow.draw();
    switch (act.kind) {
      case 'slam':
      case 'breaker': {
        // Fist seams flare as the fists come up.
        const lvl = chargeLevel(age, COLOSSUS_SLAM_MS);
        for (const a of ['fist-near', 'fist-far']) {
          const p = rig.attach(a);
          if (p) drawGlow(g, p.sx, p.sy - 10 * k1, 9 * k1, lvl);
        }
        if (act.kind === 'breaker' && act.target !== null) {
          const st = w.structures.find((s) => s.id === act.target);
          if (st) this.flashTile(st.tile[0], st.tile[1]);
        }
        return;
      }
      case 'boulder': {
        if (age >= GRAB_MS && !l.fired.has('grab')) {
          l.fired.add('grab');
          const p = rig.attach('fist-near');
          if (p) {
            this.w.fx.burst('spark-theirs', p.sx, p.sy);
            this.w.fx.burst('spark-theirs', p.sx + 10, p.sy - 4, 0, 60);
          }
        }
        const p = rig.attach('fist-near');
        if (p && age >= GRAB_MS)
          drawGlow(g, p.sx, p.sy - 10 * k1, 8 * k1, chargeLevel(age, COLOSSUS_THROW_MS));
        return;
      }
      case 'call': {
        // The spires surge, then the Skitters launch from them.
        const lvl = chargeLevel(age, COLOSSUS_CALL_MS) * 1.3;
        for (const s of spiresFor(e.boss!.mk)) {
          const p = rig.attach(s);
          if (p) drawGlow(g, p.sx, p.sy, 9 * k1, lvl);
        }
        return;
      }
    }
  }

  /** The wall a breaker targets flashes (danger red, pulsing) until the slam lands. */
  private flashTile(col: number, row: number) {
    const cam = this.w.camera;
    const a = cam.worldToScreen(col, row);
    const b = cam.worldToScreen(col + 1, row + 1);
    const u = 0.5 + 0.5 * Math.sin(this.t * 0.03);
    const up = 0.6 * (b.sy - a.sy) + 6;
    this.flash
      .draw()
      .fillStyle(theme.color.danger.num, 0.18 + 0.3 * u)
      .fillRect(a.sx, a.sy - up, b.sx - a.sx, b.sy - a.sy + up);
  }

  /**
   * Once a frame, after the enemies: impacts where the Colossus's markers land (not the ones a
   * stagger called off), Runners launching from the spires, and the final-phase shockwave bands.
   */
  frame(w: World, rigOf: (id: EntityId) => RigSprite | null): void {
    const bosses = new Map<EntityId, EnemyEnt>();
    for (const e of w.enemies) if (e.boss) bosses.set(e.id, e);
    for (const id of this.looks.keys()) if (!bosses.has(id)) this.looks.delete(id);

    const live = new Set<EntityId>();
    for (const m of w.markers) {
      if (!bosses.has(m.source) && !this.markers.has(m.id)) continue;
      live.add(m.id);
      if (this.markers.has(m.id)) continue;
      if (m.shape === 'ring') {
        const key = `${m.source}:${m.createdAt}`;
        const wv = this.waves.get(key);
        const inner = m.inner ?? 0;
        if (!wv) {
          this.waves.set(key, {
            x: m.x,
            y: m.y,
            r0: inner,
            band: m.r - inner,
            n: 1,
            stepTicks: m.landsAt - m.createdAt,
            createdAt: m.createdAt,
          });
        } else {
          wv.r0 = Math.min(wv.r0, inner);
          wv.n++;
        }
        this.markers.set(m.id, { x: m.x, y: m.y, r: m.r, landsAt: m.landsAt, boulder: false });
        continue;
      }
      this.markers.set(m.id, {
        x: m.x,
        y: m.y,
        r: m.r,
        landsAt: m.landsAt,
        boulder: m.payload.tags.includes('boulder'),
      });
    }
    for (const [id, k] of this.markers) {
      if (live.has(id)) continue;
      this.markers.delete(id);
      if (w.tick >= k.landsAt && k.r > 0) this.impact(k);
    }

    // Runners launch from the spires as the call's wind-up ends.
    for (const e of bosses.values()) {
      const act = e.boss!.act;
      const l = this.looks.get(e.id);
      const rig = rigOf(e.id);
      if (!act || act.kind !== 'call' || !l || !rig) continue;
      if (w.tick + 1 >= act.at && !l.fired.has('launch')) {
        l.fired.add('launch');
        for (const s of spiresFor(e.boss!.mk)) {
          const p = rig.attach(s);
          if (p) this.w.fx.burst('spark-theirs', p.sx, p.sy - 6);
        }
      }
    }

    // Shockwave rings: a violet outline on the band the sim is landing now.
    for (const [key, wv] of this.waves) {
      const u = (w.tick - wv.createdAt) / wv.stepTicks;
      if (u > wv.n + 0.5) {
        this.waves.delete(key);
        continue;
      }
      // The band rolls out between the slam's circle and its last ring.
      const r = wv.r0 + Math.min(wv.n, Math.max(0, u)) * wv.band;
      const s = this.w.camera.worldToScreen(wv.x, wv.y);
      const { rx, ry } = this.w.camera.groundEllipse(r);
      const fade = Math.min(1, wv.n + 0.5 - u);
      this.glow
        .draw()
        .lineStyle(10, theme.color.hostile.num, 0.22 * fade)
        .strokeEllipse(s.sx, s.sy, rx * 2, ry * 2)
        .lineStyle(3, theme.color.hostileCore.num, 0.95 * fade)
        .strokeEllipse(s.sx, s.sy, rx * 2, ry * 2);
    }
  }

  private impact(k: KnownMarker) {
    const fx = this.w.fx;
    const s = this.w.camera.worldToScreen(k.x, k.y);
    fx.ring('theirs', k.x, k.y, k.r, k.boulder ? 320 : 420);
    fx.burst('spark-theirs', s.sx, s.sy - 6);
    fx.burst('spark-theirs', s.sx + 14, s.sy - 2, 0, 50);
    fx.burst('spark-theirs', s.sx - 14, s.sy - 4, 0, 90);
    if (k.boulder) fx.scrap('theirs', 2, s.sx, s.sy, 700);
  }

  /** Clears every look (a debug wave jump, a new run). */
  clear(): void {
    this.looks.clear();
    this.markers.clear();
    this.waves.clear();
  }

  destroy(): void {
    this.clear();
    this.glow.destroy();
    this.flash.destroy();
  }
}
