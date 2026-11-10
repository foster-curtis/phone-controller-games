// Runs a command and resolves with its exit code, streaming output. With a prefix, each line is
// tagged (`[say-cheese] …`) so concurrent runs stay readable.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { ROOT } from './workspace.mjs';

const quote = (arg) => (/[\s"&|<>^()]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg);

/**
 * @param {string} cmd `pnpm` (run through a shell, which Windows needs for pnpm.cmd) or an executable
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string>, prefix?: string }} [opts]
 * @returns {Promise<{ code: number, ms: number }>}
 */
export function run(cmd, args, { cwd = ROOT, env = {}, prefix } = {}) {
  const started = Date.now();
  const shell = cmd === 'pnpm';
  const fullEnv = { ...process.env, ...env };
  if (prefix && process.stdout.isTTY && !('FORCE_COLOR' in fullEnv)) fullEnv.FORCE_COLOR = '1';
  const child = shell
    ? spawn([cmd, ...args.map(quote)].join(' '), {
        cwd,
        env: fullEnv,
        shell: true,
        stdio: prefix ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      })
    : spawn(cmd, args, {
        cwd,
        env: fullEnv,
        stdio: prefix ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      });
  if (prefix) {
    for (const [stream, out] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      createInterface({ input: stream }).on('line', (line) => out.write(`${prefix} ${line}\n`));
    }
  }
  return new Promise((resolvePromise) => {
    child.on('error', (err) => {
      console.error(`${prefix ?? ''} ${cmd}: ${err.message}`);
      resolvePromise({ code: 1, ms: Date.now() - started });
    });
    child.on('close', (code) => resolvePromise({ code: code ?? 1, ms: Date.now() - started }));
  });
}

export const seconds = (ms) => `${(ms / 1000).toFixed(0)} s`;
