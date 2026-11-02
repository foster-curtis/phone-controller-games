// Replays (SPEC §15.9, developer tool): the recorder keeps `RunStart`, every input sample that changed,
// every command (per step) and the build's commit hash, plus the state hash every 60 steps; `replayRun`
// re-runs a recording headless and reports the first divergence. Replays are tied to the exact build.
import { stateHash } from './hash';
import { createSim, type StepObserver } from './sim';
import { AutopilotInputSource, ReplayInputSource } from './sources';
import type { PlayerInput, RunStart, SimCommand, World } from './types';

/** Steps between recorded state hashes (§15.9). */
export const hashEvery = 60;

export interface RunRecording {
  v: 1;
  /** Commit hash of the build that recorded it. */
  build: string;
  start: RunStart;
  /** Steps run. */
  steps: number;
  /** [tick, slot, sample]: only samples that differ from that slot's previous one. */
  inputs: [tick: number, slot: number, input: PlayerInput][];
  /** [tick, command], in the order applied. */
  commands: [tick: number, cmd: SimCommand][];
  /** [tick, state hash] after every `hashEvery` steps. */
  hashes: [tick: number, hash: number][];
}

function sameInput(a: PlayerInput, b: PlayerInput): boolean {
  return (
    a.move.x === b.move.x &&
    a.move.y === b.move.y &&
    a.mainAim.x === b.mainAim.x &&
    a.mainAim.y === b.mainAim.y &&
    a.superAim.x === b.superAim.x &&
    a.superAim.y === b.superAim.y &&
    a.mainAiming === b.mainAiming &&
    a.superAiming === b.superAiming &&
    a.radialOpen === b.radialOpen &&
    a.radialSlot === b.radialSlot &&
    a.mainFires === b.mainFires &&
    a.superFires === b.superFires &&
    a.actionTaps === b.actionTaps &&
    a.radialCommits === b.radialCommits
  );
}

/** −0 → 0, so a sample survives JSON exactly. */
const z = (n: number) => n + 0;

function copy(i: PlayerInput): PlayerInput {
  return {
    move: { x: z(i.move.x), y: z(i.move.y) },
    mainAim: { x: z(i.mainAim.x), y: z(i.mainAim.y) },
    superAim: { x: z(i.superAim.x), y: z(i.superAim.y) },
    mainAiming: i.mainAiming,
    superAiming: i.superAiming,
    radialOpen: i.radialOpen,
    radialSlot: i.radialSlot,
    mainFires: i.mainFires,
    superFires: i.superFires,
    actionTaps: i.actionTaps,
    radialCommits: i.radialCommits,
  };
}

/** Pass as the sim's `observer`. */
export class RunRecorder implements StepObserver {
  private readonly last = new Map<number, PlayerInput>();
  private readonly rec: RunRecording;

  constructor(start: RunStart, build: string) {
    this.rec = {
      v: 1,
      build,
      start: structuredClone(start),
      steps: 0,
      inputs: [],
      commands: [],
      hashes: [],
    };
  }

  commands(tick: number, cmds: readonly SimCommand[]): void {
    for (const c of cmds) this.rec.commands.push([tick, structuredClone(c)]);
  }

  input(tick: number, slot: number, input: PlayerInput): void {
    const prev = this.last.get(slot);
    if (prev && sameInput(prev, input)) return;
    const c = copy(input);
    this.last.set(slot, c);
    this.rec.inputs.push([tick, slot, c]);
  }

  stepped(world: World): void {
    this.rec.steps = world.tick;
    if (world.tick % hashEvery === 0) this.rec.hashes.push([world.tick, stateHash(world)]);
  }

  recording(): RunRecording {
    return this.rec;
  }
}

export interface ReplayResult {
  steps: number;
  /** Hashes compared. */
  checked: number;
  /** The first mismatch, or null. */
  divergence: { tick: number; expected: number; actual: number } | null;
}

/** Re-runs a recording headless, checking the state hash every `hashEvery` steps. */
export function replayRun(rec: RunRecording): ReplayResult {
  const sources = new Map<number, ReplayInputSource>();
  for (const s of rec.start.slots) {
    const mine = rec.inputs
      .filter(([, slot]) => slot === s.slot)
      .map(([t, , i]) => [t, i] as const);
    sources.set(s.slot, new ReplayInputSource(mine));
  }
  const sim = createSim(rec.start, { sources });
  const expected = new Map(rec.hashes);
  let ci = 0;
  let checked = 0;
  for (let t = 0; t < rec.steps; t++) {
    while (ci < rec.commands.length && rec.commands[ci]![0] === t)
      sim.command(rec.commands[ci++]![1]);
    sim.step();
    const want = expected.get(sim.world.tick);
    if (want === undefined) continue;
    checked++;
    const actual = stateHash(sim.world);
    if (actual !== want) {
      return {
        steps: sim.world.tick,
        checked,
        divergence: { tick: sim.world.tick, expected: want, actual },
      };
    }
  }
  return { steps: sim.world.tick, checked, divergence: null };
}

/**
 * Records a headless autopilot run of the content's waves (soak and replay fixture, §15.9): every slot
 * on autopilot, invincible, ready once each has bought its crates or after 10 s of build.
 */
export function recordAutopilotRun(opts: {
  seed: number;
  players: number;
  build: string;
  invincible?: boolean;
  maxSteps?: number;
}): RunRecording {
  const classes = ['engineer'] as const;
  const colors = ['cobalt', 'jade', 'sky', 'bone', 'rose', 'forest'] as const;
  const start: RunStart = {
    seed: opts.seed,
    settings: { theme: 'neon-knights', difficulty: 'normal' },
    slots: Array.from({ length: opts.players }, (_, i) => ({
      slot: i,
      name: `Bot${i + 1}`,
      color: colors[i % colors.length]!,
      classId: classes[i % classes.length]!,
      connected: true,
    })),
  };
  const rec = new RunRecorder(start, opts.build);
  const sim = createSim(start, { observer: rec });
  for (const s of start.slots)
    sim.setSource(s.slot, new AutopilotInputSource(() => sim.world, s.slot));
  if (opts.invincible ?? true)
    sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  const max = opts.maxSteps ?? 60 * 60 * 15;
  let buildStart = -1;
  for (let i = 0; i < max && sim.world.phase !== 'summary'; i++) {
    const w = sim.world;
    if (w.phase === 'build') {
      if (buildStart < 0) buildStart = w.tick;
      const stocked = w.players.every((p) => p.crates >= 2 || w.team.coins < 2);
      if ((stocked && w.tick - buildStart > 120) || w.tick - buildStart > 600) {
        for (const p of w.players)
          if (!p.ready) sim.command({ c: 'ready', slot: p.slot, ready: true });
      }
    } else {
      buildStart = -1;
    }
    sim.step();
  }
  return rec.recording();
}
