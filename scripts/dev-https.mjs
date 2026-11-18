// HTTPS LAN dev for real phones (controller-compat F4): `pnpm dev:https:<game>`.
//   node scripts/dev-https.mjs <game> [--port 5443] [--relay-port 8793]
// Phones need a secure context for some APIs (camera, wake lock, clipboard), so this serves the game's
// Vite dev server over HTTPS on the LAN. The relay sits behind the same origin at `/relay` (Vite
// proxies the WebSocket), so a phone accepts ONE self-signed certificate and nothing else.
// The game's own vite.config.ts is untouched: a wrapper config in `.pcg-cache/` merges the HTTPS,
// host and proxy settings on top of it. Relay output is appended to `.pcg-cache/relay-lan.log`.
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import net from 'node:net';
import qrcode from 'qrcode';
import { pickLanAddress } from '../packages/game-kit/src/lan.ts';
import { CACHE, ROOT } from './lib/workspace.mjs';

const args = process.argv.slice(2);
const game = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};
const port = opt('port', 5443);
const relayPort = opt('relay-port', 8793);
if (
  !game ||
  !existsSync(join(ROOT, 'apps', game, 'play.html')) ||
  ![port, relayPort].every(Number.isInteger)
) {
  console.error('usage: node scripts/dev-https.mjs <game> [--port 5443] [--relay-port 8793]');
  console.error('  <game> is an app folder with a play.html (sunny-side, fort-frenzy, say-cheese)');
  process.exit(1);
}

const appDir = join(ROOT, 'apps', game);
const address = pickLanAddress(networkInterfaces());
if (!address) {
  console.error('No LAN IPv4 address found: the TV and phones need one Wi-Fi network.');
  process.exit(1);
}
const tvUrl = `https://${address}:${port}/`;
const phoneUrl = `https://${address}:${port}/play`;

mkdirSync(CACHE, { recursive: true });
const logPath = join(CACHE, 'relay-lan.log');
appendFileSync(
  logPath,
  `\n=== ${new Date().toISOString()} dev:https:${game} relay :${relayPort} ===\n`,
);

// Wrapper config: the game's own config plus HTTPS, LAN host and the same-origin relay proxy.
const wrapperPath = join(CACHE, `vite-https-${game}.config.mjs`);
const q = (value) => JSON.stringify(value);
writeFileSync(
  wrapperPath,
  `import basicSsl from '@vitejs/plugin-basic-ssl';
import { mergeConfig } from 'vite';
import base from ${q(join(appDir, 'vite.config.ts').replaceAll('\\', '/'))};

export default async (env) =>
  mergeConfig(await (typeof base === 'function' ? base(env) : base), {
    plugins: [basicSsl()],
    server: {
      host: true,
      port: ${port},
      strictPort: true,
      proxy: {
        '/relay': {
          target: 'ws://127.0.0.1:${relayPort}',
          ws: true,
          rewrite: (path) => path.replace(/^\\/relay/, '') || '/',
        },
      },
    },
  });
`,
);

if (game === 'fort-frenzy') {
  // Its dev script runs this first (generated atlases the host imports).
  const r = spawnSync('pnpm', ['assets'], { cwd: appDir, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const children = [];
function start(label, cmd, cmdArgs, { cwd, env, tee }) {
  const child = spawn(cmd, cmdArgs, {
    cwd,
    env: { ...process.env, ...env },
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  for (const [stream, out] of [
    [child.stdout, process.stdout],
    [child.stderr, process.stderr],
  ]) {
    createInterface({ input: stream }).on('line', (line) => {
      out.write(`[${label}] ${line}\n`);
      if (tee) appendFileSync(tee, `${line}\n`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[${label}] exited (${code}); stopping`);
      stop(1);
    }
  });
}

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode !== null || !child.pid) continue;
    // `shell: true` makes the child a shell: kill its whole tree (taskkill on Windows).
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start('relay', 'pnpm', ['--filter', '@pcg/relay', 'start'], {
  cwd: ROOT,
  env: { PORT: String(relayPort), RELAY_LOG: '1' },
  tee: logPath,
});
start('web', 'pnpm', ['exec', 'vite', '--config', `"${wrapperPath}"`], {
  cwd: appDir,
  env: { VITE_RELAY_URL: `wss://${address}:${port}/relay` },
});

const listening = () =>
  new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.on('connect', () => (socket.destroy(), resolve(true)));
    socket.on('error', () => resolve(false));
  });
for (let i = 0; i < 240 && !stopping; i++) {
  if (await listening()) break;
  await new Promise((r) => setTimeout(r, 500));
}
if (!stopping) {
  const qr = (url) => qrcode.toString(url, { type: 'terminal', small: true });
  console.log(`\n  ${game} over HTTPS on the LAN`);
  console.log(`\n  TV (open on the laptop/TV): ${tvUrl}`);
  console.log(await qr(tvUrl));
  console.log(`  Phone (join from the room code): ${phoneUrl}`);
  console.log(await qr(phoneUrl));
  console.log(`  Relay log: ${logPath}`);
  console.log(
    '  Certificate: self-signed, so each browser warns once: accept it (Advanced > proceed) on the TV and every phone.',
  );
  console.log('  Ctrl+C stops the relay and the dev server.\n');
}
