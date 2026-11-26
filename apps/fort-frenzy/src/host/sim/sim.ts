// The run simulation (SPEC §15.3): one deterministic sim from the countdown to the summary. Everything
// that changes run state enters as an input sample or a command at the start of a step; the step runs
// its systems in the fixed order below.
import { content as defaultContent, type Content } from '../../content';
import type { BuildId, EnemyId, SideId } from '../../shared/ids';
import { createCatalog } from './catalog';
import { stepSquads } from './squad';
import { stepBuilds } from './builds/core';
import { stepArchers, stepMarkers, stepProjectiles } from './combat';
import { applyCommands } from './commands';
import { stepDeaths, stepEffects, stepPhases, stepSpawner } from './lifecycle';
import { rebuildSpatial, stepMovement } from './movement';
import { stepPlayers } from './players';
import { aiKinds } from './registry';
import { restoreSnapshot } from './snapshot';
import { createState, neutralInput, type FullState } from './state';
import type {
  EnemyEnt,
  InputSource,
  PlayerInput,
  RunStart,
  SimCommand,
  BuildEnt,
  SoldierEnt,
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
  /** A landed build at (x, y) for `slot`, outside the rules (the bench's peak builds, resume tests). */
  addBuild(kind: BuildId, x: number, y: number, slot: number): BuildEnt;
  addSoldier(owner: number, x: number, y: number): SoldierEnt;
  /** The debug panel's forced hot side (the `hot` debug command, RD6), or null. */
  readonly debugHot: SideId | null;
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
    st.main = st.super = st.build = false;
    const prev = st.prev;
    if (!p.connected || st.baseline) {
      // Dazed, or the first sample after a (re)connect: baseline only, never fire (§15.3).
      prev.mainFires = raw.mainFires;
      prev.superFires = raw.superFires;
      prev.buildFires = raw.buildFires;
      st.baseline = !p.connected;
      continue;
    }
    // A counter going backwards (phone reload) re-baselines without firing.
    st.main = raw.mainFires > prev.mainFires;
    st.super = raw.superFires > prev.superFires;
    st.build = raw.buildFires > prev.buildFires;
    prev.mainFires = raw.mainFires;
    prev.superFires = raw.superFires;
    prev.buildFires = raw.buildFires;
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
  // A resumed run starts in the snapshot's build phase (§11.5, §15.8; FF14).
  if (start.snapshot) restoreSnapshot(s, start.snapshot);
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
    // 2. input samples → presses
    sampleInputs(s, sources, obs);
    // 3. players: movement, attacks and supers, build presses
    rebuildSpatial(s);
    stepPlayers(s);
    // Builds: flights land, switch-on, effects in combat (the shield generator's guard)
    stepBuilds(s);
    // 4. AI: enemies (the boss module included), then the sentries
    if (w.phase === 'combat') {
      stepEnemies(s);
      stepArchers(s);
    }
    // The Commanders' squads (FF9): follow or hold the flag in both phases, fight in combat.
    if (w.phase === 'combat' || w.phase === 'build') stepSquads(s);
    // 5. integrate movement, soft separation, `blocked`-tile collision
    stepMovement(s);
    // 6. projectiles and area attacks
    stepProjectiles(s);
    stepMarkers(s);
    // 7. status effects, onTick hooks
    stepEffects(s);
    // 8. deaths: hooks, coins; destroyed builds removed
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
    addBuild: (kind, x, y, slot) => s.addBuild(kind, x, y, slot),
    addSoldier: (owner, x, y) => s.addSoldier(owner, x, y),
    get debugHot() {
      return s.debugHot;
    },
  };
}
