// The run simulation (SPEC §15.3): one deterministic sim from the countdown to the summary. Everything
// that changes run state enters as an input sample or a command at the start of a step; the step runs
// its systems in the fixed order below.
import { content as defaultContent, type Content } from '../../content';
import type { EnemyId, StructureId } from '../../shared/ids';
import { createCatalog } from './catalog';
import { stepThrown } from './classes/quartermaster';
import { stepSquads } from './squad';
import { stepArchers, stepMarkers, stepProjectiles, stepStructures } from './combat';
import { applyCommands } from './commands';
import { stepDeaths, stepEffects, stepPhases, stepSpawner } from './lifecycle';
import { rebuildSpatial, stepMovement } from './movement';
import { stepPlayers } from './players';
import { aiKinds } from './registry';
import { createState, neutralInput, type FullState } from './state';
import type {
  EnemyEnt,
  InputSource,
  PlayerInput,
  RunStart,
  SimCommand,
  SoldierEnt,
  StructureEnt,
  World,
} from './types';

/** Watches a run step by step (the recorder, §15.9). */
export interface StepObserver {
  /** The commands applied at the start of step `tick`, in order. */
  commands?(tick: number, cmds: readonly SimCommand[]): void;
  /** The sample read for `slot` at step `tick` (before counter diffing). */
  input?(tick: number, slot: number, input: PlayerInput): void;
  /** After a step; `world.tick` has advanced. */
  stepped?(world: World): void;
}

export interface SimOptions {
  content?: Content;
  /** Input source per slot; a slot without one reads neutral input. */
  sources?: ReadonlyMap<number, InputSource>;
  observer?: StepObserver;
}

export interface Sim {
  readonly world: World;
  readonly content: Content;
  /** Queues a command for the start of the next step (applied in the order queued). */
  command(cmd: SimCommand): void;
  setSource(slot: number, source: InputSource): void;
  /** Runs one 60 Hz step. */
  step(): void;
  /**
   * Test, bench and tooling helpers that change the world directly between steps. They bypass the
   * rules and the command log, so a replay can't reproduce them: the host uses commands.
   */
  spawnEnemy(kind: EnemyId, x: number, y: number): EnemyEnt;
  place(kind: StructureId, col: number, row: number, slot: number): StructureEnt;
  addSoldier(owner: number, x: number, y: number): SoldierEnt;
}

const neutral = neutralInput();

/** Step 2: sample every slot; diff press counters into this step's presses. */
function sampleInputs(s: FullState, sources: Map<number, InputSource>, obs?: StepObserver) {
  const t = s.world.tick;
  for (const p of s.world.players) {
    const raw = sources.get(p.slot)?.sample(t) ?? neutral;
    obs?.input?.(t, p.slot, raw);
    const st = s.inputs.get(p.slot)!;
    st.input = raw;
    st.main = st.super = st.action = st.radial = false;
    const prev = st.prev;
    if (!p.connected || st.baseline) {
      // Dazed, or the first sample after a (re)connect: baseline only, never fire (§15.3).
      prev.mainFires = raw.mainFires;
      prev.superFires = raw.superFires;
      prev.actionTaps = raw.actionTaps;
      prev.radialCommits = raw.radialCommits;
      st.baseline = !p.connected;
      continue;
    }
    // A counter going backwards (phone reload) re-baselines without firing.
    st.main = raw.mainFires > prev.mainFires;
    st.super = raw.superFires > prev.superFires;
    st.action = raw.actionTaps > prev.actionTaps;
    st.radial = raw.radialCommits > prev.radialCommits;
    prev.mainFires = raw.mainFires;
    prev.superFires = raw.superFires;
    prev.actionTaps = raw.actionTaps;
    prev.radialCommits = raw.radialCommits;
  }
}

function stepEnemies(s: FullState) {
  for (const e of s.world.enemies) {
    if (e.hp <= 0) continue;
    // A stunned enemy stands still and loses any wind-up in progress (§9.6: the Warden's window).
    if (e.effects.some((x) => x.def === 'stun')) {
      e.vx = e.vy = 0;
      e.attack.windupEndsAt = null;
      continue;
    }
    const def = s.cat.enemy(e.kind);
    aiKinds[def.ai]?.(s, e);
  }
}

export function createSim(start: RunStart, opts: SimOptions = {}): Sim {
  const content = opts.content ?? defaultContent;
  const s = createState(start, createCatalog(content, start.settings.difficulty));
  const sources = new Map(opts.sources ?? []);
  const obs = opts.observer;
  let queue: SimCommand[] = [];

  function step() {
    const w = s.world;
    w.events.length = 0;
    // 1. commands, in logged order
    const cmds = queue;
    queue = [];
    obs?.commands?.(w.tick, cmds);
    applyCommands(s, cmds);
    if (w.fields.dirty) s.rebuildFields();
    // 2. input samples → presses
    sampleInputs(s, sources, obs);
    // 3. players: movement, attacks and supers, action button, build arc, crates
    rebuildSpatial(s);
    stepPlayers(s);
    if (w.fields.dirty) s.rebuildFields();
    // 4. AI: enemies (soldiers and the boss arrive with FF9/FF11), then structures and archers
    if (w.phase === 'combat') {
      stepEnemies(s);
      stepStructures(s);
      stepArchers(s);
    }
    // The Commanders' squads (FF9): follow or hold the flag in both phases, fight in combat.
    if (w.phase === 'combat' || w.phase === 'build') stepSquads(s);
    // 5. integrate movement, soft separation, structure collision
    stepMovement(s);
    // 6. projectiles and area attacks
    stepProjectiles(s);
    stepMarkers(s);
    stepThrown(s);
    // 7. status effects, onTick hooks
    stepEffects(s);
    // 8. deaths: hooks, coins, crate drops; destroyed blockers rebuild the flow fields
    stepDeaths(s);
    // 9. wave spawner
    stepSpawner(s);
    // 10. phase checks
    stepPhases(s);
    w.tick++;
    obs?.stepped?.(w);
  }

  return {
    world: s.world,
    content,
    command(cmd) {
      queue.push(cmd);
    },
    setSource(slot, source) {
      sources.set(slot, source);
    },
    step,
    spawnEnemy: (kind, x, y) => s.spawnEnemy(kind, x, y, null),
    place: (kind, col, row, slot) => s.placeStructure(kind, col, row, slot),
    addSoldier: (owner, x, y) => s.addSoldier(owner, x, y),
  };
}
