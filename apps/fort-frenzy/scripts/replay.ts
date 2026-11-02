// Replays a recorded run headless (SPEC §15.9, developer tool): re-runs it from `RunStart`, the recorded
// inputs and commands, checks the state hash every 60 steps and reports the first divergence.
//
//   tsx scripts/replay.ts <file.json[.gz]>
//   tsx scripts/replay.ts --record <file.json[.gz]> [--seed N] [--players N]   (an autopilot run)
//
// Exits 1 on a divergence. Replays are tied to the exact build: a different commit only warns.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { recordAutopilotRun, replayRun, type RunRecording } from '../src/host/sim/index';

function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function flag(args: string[], name: string, fallback: number): number {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : fallback;
}

function usage(): never {
  console.error('usage: tsx scripts/replay.ts <file> | --record <file> [--seed N] [--players N]');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args[0] === '--record') {
  const file = args[1] ?? usage();
  const seed = flag(args, '--seed', 1);
  const players = flag(args, '--players', 2);
  const rec = recordAutopilotRun({ seed, players, build: commit() });
  const json = JSON.stringify(rec);
  writeFileSync(file, file.endsWith('.gz') ? gzipSync(json) : json);
  console.log(
    `recorded ${file}: seed ${seed}, ${players} players, ${rec.steps} steps, ` +
      `${rec.inputs.length} input changes, ${rec.commands.length} commands, build ${rec.build}`,
  );
} else {
  const file = args[0] ?? usage();
  const raw = readFileSync(file);
  const text =
    raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw).toString('utf8') : raw.toString('utf8');
  const rec = JSON.parse(text) as RunRecording;
  const here = commit();
  if (rec.build !== here) console.log(`note: recorded on build ${rec.build}, replaying on ${here}`);
  const t0 = process.hrtime.bigint();
  const r = replayRun(rec);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.divergence) {
    const d = r.divergence;
    console.log(
      `replay ${file}: first divergence at tick ${d.tick} (hash check ${r.checked}): ` +
        `expected ${d.expected}, got ${d.actual}`,
    );
    process.exit(1);
  }
  console.log(
    `replay ${file}: ${r.steps} steps, ${r.checked} hashes checked, 0 divergences (${ms.toFixed(0)} ms)`,
  );
}
