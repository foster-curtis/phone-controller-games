// Recorder and replays (SPEC §15.9): a recorded autopilot run replays headless with zero divergence,
// in-process and through `scripts/replay.ts`.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { recordAutopilotRun, replayRun, ReplayInputSource, RunRecorder } from '../index';
import { createSim } from '../index';
import type { PlayerInput } from '../types';
import { startOf } from './harness';

describe('RunRecorder', () => {
  it('records the start, changed inputs only, commands and the build', () => {
    const start = startOf(1, 3);
    const rec = new RunRecorder(start, 'abc123');
    const sim = createSim(start, { observer: rec });
    sim.command({ c: 'debug', slot: -1, action: 'coins', amount: 5, ref: 1 });
    for (let i = 0; i < 120; i++) sim.step();
    const r = rec.recording();
    expect(r.build).toBe('abc123');
    expect(r.start).toEqual(start);
    expect(r.steps).toBe(120);
    // The pad never changed: one neutral sample at tick 0.
    expect(r.inputs).toHaveLength(1);
    expect(r.inputs[0]![0]).toBe(0);
    expect(r.commands).toEqual([[0, { c: 'debug', slot: -1, action: 'coins', amount: 5, ref: 1 }]]);
    expect(r.hashes.map(([t]) => t)).toEqual([60, 120]);
  });

  it('ReplayInputSource returns the latest recorded sample at or before the tick', () => {
    const a = { move: { x: 1, y: 0 } } as PlayerInput;
    const b = { move: { x: 0, y: 1 } } as PlayerInput;
    const src = new ReplayInputSource([
      [5, a],
      [9, b],
    ]);
    expect(src.sample(0).move).toEqual({ x: 0, y: 0 });
    expect(src.sample(5)).toBe(a);
    expect(src.sample(8)).toBe(a);
    expect(src.sample(9)).toBe(b);
    expect(src.sample(400)).toBe(b);
  });
});

describe('replay', () => {
  const recording = recordAutopilotRun({ seed: 21, players: 2, build: 'test' });

  it('an autopilot run covers both waves', () => {
    expect(recording.inputs.length).toBeGreaterThan(50);
    expect(recording.commands.length).toBeGreaterThan(0);
    expect(recording.hashes.length).toBeGreaterThan(30);
  });

  it('replays in-process with zero divergence', () => {
    const r = replayRun(JSON.parse(JSON.stringify(recording)));
    expect(r.divergence).toBeNull();
    expect(r.checked).toBe(recording.hashes.length);
  });

  it('reports the first divergence', () => {
    const bad = JSON.parse(JSON.stringify(recording)) as typeof recording;
    bad.hashes[3]![1] ^= 1;
    bad.hashes[7]![1] ^= 1;
    const r = replayRun(bad);
    expect(r.divergence).toEqual({
      tick: bad.hashes[3]![0],
      expected: bad.hashes[3]![1],
      actual: recording.hashes[3]![1],
    });
  });

  it('scripts/replay.ts replays a gzipped file with zero divergence', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ff-replay-'));
    const file = join(dir, 'run.json.gz');
    writeFileSync(file, gzipSync(JSON.stringify(recording)));
    const app = resolve(import.meta.dirname, '../../../..');
    const out = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/replay.ts', file], {
      cwd: app,
      encoding: 'utf8',
    });
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toMatch(/0 divergences/);
  }, 30_000);
});
