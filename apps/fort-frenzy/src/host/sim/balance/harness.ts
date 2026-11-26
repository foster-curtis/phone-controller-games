// The balance harness (SPEC §2 balance rule, §15.9; a report, never a gate, §15.11 #72): each knight
// alone, on autopilot with its build policy (autopilot/builds.ts; a knight without one plays without
// builds), no cards, the meter full as every run starts, against `content.harness`: the standard wave
// from one portal at solo scaling, over its seeds. Reports each knight's clear times (median, min,
// max) and how far its median sits from the mean of every knight's median, flagged outside the
// harness's ±20% and ±25% bands. Headless and deterministic: the same content and seeds, the same
// report.
import type { Content } from '../../../content';
import type { WaveDef } from '../../../content/types';
import { PLAYER_COLOR_IDS, type KnightId } from '../../../shared/ids';
import { buildPolicies } from '../autopilot/builds';
import { createSim } from '../sim';
import { AutopilotInputSource } from '../sources';
import { SIM_HZ } from '../types';

export interface HarnessRow {
  knight: KnightId;
  /** Whether the knight has a build policy (else it fought without builds). */
  builds: boolean;
  /** Clear time per seed (s); null = not cleared (the Citadel fell or the cap ran out). */
  times: (number | null)[];
  /** Over the cleared runs (null when none cleared). */
  median: number | null;
  min: number | null;
  max: number | null;
  /** Median vs the mean of every knight's median (fraction, +0.1 = 10% slower). */
  offMean: number | null;
  /** The widest band the median falls outside: 0 (inside both), 1 (±20%), 2 (±25%). */
  flag: 0 | 1 | 2;
}

export interface HarnessReport {
  seeds: number[];
  bands: [number, number];
  /** Mean of the knights' medians (s). */
  mean: number | null;
  rows: HarnessRow[];
}

/** The harness wave as wave 1 of a one-wave run: every group pinned to the harness portal. */
function harnessContent(content: Content): Content {
  const h = content.harness;
  if (!h) throw new Error('balance: content has no harness');
  if (h.durationMs === undefined || h.capMs === undefined)
    throw new Error('balance: harness needs durationMs and capMs');
  const wave: WaveDef = {
    n: 1,
    budget: 0,
    allowed: [...new Set(h.wave.map((g) => g.enemy))],
    guaranteed: h.wave.map((g) => ({ enemy: g.enemy, count: g.count, portal: h.portal })),
    durationMs: h.durationMs,
    hot: { mode: 'wave', shifts: 0 },
  };
  return { ...content, waves: [wave] };
}

/** One knight, one seed: seconds of combat until the wave is cleared, or null. */
export function harnessRun(content: Content, knight: KnightId, seed: number): number | null {
  const c = harnessContent(content);
  const h = c.harness!;
  const sim = createSim(
    {
      seed,
      settings: { difficulty: h.difficulty },
      slots: [{ slot: 0, name: 'H', color: PLAYER_COLOR_IDS[0], classId: knight, connected: true }],
    },
    { content: c },
  );
  sim.setSource(0, new AutopilotInputSource(() => sim.world, 0, c));
  const w = sim.world;
  for (let i = 0; i < 60 * 60 && w.phase !== 'combat'; i++) {
    if (w.phase === 'build') {
      // No cards (the deadline's random pick included): the offer goes before Ready.
      for (const p of w.players) {
        p.offer = null;
        if (!p.ready) sim.command({ c: 'ready', slot: p.slot, ready: true });
      }
    }
    sim.step();
  }
  const start = w.tick;
  const cap = start + Math.round((h.capMs! * SIM_HZ) / 1000);
  while (w.tick < cap) {
    sim.step();
    for (const e of w.events) if (e.e === 'waveCleared') return (w.tick - 1 - start) / SIM_HZ;
    if (w.phase === 'defeat') return null;
  }
  return null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Every knight in content against the harness wave over `seeds` (default the harness's). */
export function runHarness(content: Content, seeds?: readonly number[]): HarnessReport {
  const h = content.harness;
  if (!h) throw new Error('balance: content has no harness');
  const use = [...(seeds ?? h.seeds)];
  const rows: HarnessRow[] = content.knights.map((k) => {
    const times = use.map((seed) => harnessRun(content, k.id, seed));
    const done = times.filter((t): t is number => t !== null);
    return {
      knight: k.id,
      builds: buildPolicies[k.id] !== undefined,
      times,
      median: median(done),
      min: done.length > 0 ? Math.min(...done) : null,
      max: done.length > 0 ? Math.max(...done) : null,
      offMean: null,
      flag: 0,
    };
  });
  const medians = rows.flatMap((r) => (r.median === null ? [] : [r.median]));
  const mean = medians.length > 0 ? medians.reduce((a, b) => a + b, 0) / medians.length : null;
  for (const r of rows) {
    if (mean === null || r.median === null) continue;
    r.offMean = (r.median - mean) / mean;
    const off = Math.abs(r.offMean);
    r.flag = off > h.bands[1] ? 2 : off > h.bands[0] ? 1 : 0;
  }
  return { seeds: use, bands: h.bands, mean, rows };
}
