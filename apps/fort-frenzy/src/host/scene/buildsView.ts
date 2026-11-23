// The builds on the TV (SPEC §7.5, §15.2; RD5): one view per sim `BuildEnt` whose kind has a view in
// `scene/builds/<build>.ts` (found with `import.meta.glob`, no registry). The scene fills each view's
// state from the sim every frame (thrown builds along their `Flight` with a code-drawn arc), holds a
// destroyed build's wreck briefly, then drops the `scrap-ours` pile. Reads the sim, never writes it.
import { lerp } from '@pcg/game-kit';
import type { Content } from '../../content';
import type { BuildDef } from '../../content/types';
import type { BuildId } from '../../shared/ids';
import {
  BUILD_SCRAP_SIZE,
  buildPhase,
  DESTROYED_HOLD_MS,
  flightProgress,
  hpFraction,
  throwHeight,
} from '../render/buildLook';
import { MINE_BLAST_RING_R } from '../render/keys';
import type { BuildView, BuildViewFactory, BuildViewState } from '../render/types';
import type { RenderWorld } from '../render/world';
import { buildEffectRadius } from '../sim';
import type { BuildEnt, EntityId, SimEvent, World } from '../sim/types';

/** How long a mine's blast ring and burst show, ms. */
const MINE_BLAST_MS = 420;

const modules = import.meta.glob<{ view?: BuildViewFactory }>('./builds/*.ts', { eager: true });

/** Every build view found in `scene/builds/`, by `BuildId`. */
export const BUILD_VIEWS: ReadonlyMap<string, BuildViewFactory> = new Map(
  Object.values(modules).flatMap((m) => (m.view ? [[m.view.id, m.view] as const] : [])),
);

interface Entry {
  kind: BuildId;
  owner: number;
  view: BuildView;
  state: BuildViewState;
  /** Ms since the wreck started showing; null while the build stands. */
  dying: number | null;
}

export class BuildsView {
  private readonly entries = new Map<EntityId, Entry>();
  private readonly defs = new Map<BuildId, BuildDef>();

  constructor(
    private readonly w: RenderWorld,
    private readonly content: Content,
  ) {
    for (const d of content.builds) this.defs.set(d.id, d);
  }

  /** Views alive (tests and the stress overlay). */
  get count(): number {
    return this.entries.size;
  }

  event(e: SimEvent, world: World) {
    if (e.e === 'mineBurst') {
      const en = this.entries.get(e.build);
      if (en) this.mineBlast(en, world);
    } else if (e.e === 'buildGone') {
      const en = this.entries.get(e.build);
      if (!en) return;
      // Destroyed: the wreck shows briefly, then scrap. Replaced or used up: gone at once.
      if (e.destroyed) en.dying = 0;
      else this.drop(e.build, en);
    } else if (e.e === 'buildHit') {
      const en = this.entries.get(e.build);
      if (en && en.dying === null && en.state.phase !== 'flight')
        this.w.fx.burst('spark-ours', en.state.sx, en.state.sy - 20 * this.w.unitPx);
    }
  }

  /** The blast ring on the ground at the real blast radius, the burst over the mine (§7.5). */
  private mineBlast(en: Entry, world: World) {
    const { fx, camera, unitPx } = this.w;
    const def = this.defs.get(en.kind);
    if (!def) return;
    const owner = world.players.find((p) => p.slot === en.owner);
    const radius = buildEffectRadius(owner, def, this.content);
    const scale = camera.groundEllipse(radius).rx / (MINE_BLAST_RING_R * unitPx);
    fx.mark?.('mine-blast-ring', en.state.sx, en.state.sy, MINE_BLAST_MS, scale);
    fx.mark?.('mine-blast', en.state.sx, en.state.sy, MINE_BLAST_MS);
  }

  /** `tickF` is the fractional sim tick being drawn (the lerp point between the last two steps). */
  update(world: World, tickF: number, dtMs: number) {
    const live = new Set<EntityId>();
    for (const b of world.builds) {
      const factory = BUILD_VIEWS.get(b.kind);
      if (!factory) continue;
      live.add(b.id);
      let en = this.entries.get(b.id);
      if (!en) {
        en = {
          kind: b.kind,
          owner: b.owner,
          view: factory.create(this.w),
          state: {
            phase: 'landed',
            x: b.x,
            y: b.y,
            sx: 0,
            sy: 0,
            z: 0,
            flightU: 1,
            hpFrac: 1,
            radius: this.defs.get(b.kind)?.radius ?? 0,
            clockMs: 0,
          },
          dying: null,
        };
        this.entries.set(b.id, en);
      }
      this.fill(en.state, b, tickF);
      en.state.clockMs += dtMs;
      en.view.update(en.state, dtMs);
    }
    // Builds the sim removed: a destroyed one holds its wreck, then leaves its scrap.
    for (const [id, en] of this.entries) {
      if (live.has(id)) continue;
      if (en.dying === null) {
        this.drop(id, en);
        continue;
      }
      en.dying += dtMs;
      en.state.phase = 'destroyed';
      en.state.clockMs += dtMs;
      en.view.update(en.state, dtMs);
      if (en.dying >= DESTROYED_HOLD_MS) {
        this.w.fx.scrap('ours', BUILD_SCRAP_SIZE, en.state.sx, en.state.sy);
        this.drop(id, en);
      }
    }
  }

  private fill(s: BuildViewState, b: BuildEnt, tickF: number) {
    const hp = b.targetable ? b.maxHp : 0;
    let x = b.x;
    let y = b.y;
    s.z = 0;
    s.flightU = 1;
    if (b.state === 'flight' && b.flight) {
      const f = b.flight;
      s.flightU = flightProgress(tickF, f.launchedAt, f.landsAt);
      x = lerp(f.from.x, f.to.x, s.flightU);
      y = lerp(f.from.y, f.to.y, s.flightU);
      s.z = throwHeight(s.flightU, Math.hypot(f.to.x - f.from.x, f.to.y - f.from.y));
    }
    s.x = x;
    s.y = y;
    const p = this.w.camera.worldToScreen(x, y);
    s.sx = p.sx;
    s.sy = p.sy;
    s.hpFrac = hpFraction(b.hp, hp);
    s.phase = buildPhase({ state: b.state, hp: b.hp, maxHp: hp });
    s.triggered = b.triggerAt !== null;
    s.nextPulse = b.nextPulse;
  }

  private drop(id: EntityId, en: Entry) {
    en.view.destroy();
    this.entries.delete(id);
  }

  destroy() {
    for (const [id, en] of this.entries) this.drop(id, en);
  }
}
