// Starts `vite preview` on 4173 against a built game app and checks the routes and brand head.
// Run after `pnpm build`. `node scripts/check-routes.mjs <app>` checks one app; with no argument,
// every game app (an `apps/*` folder with a play.html), one after another.
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appsDir = join(root, 'apps');
const PORT = 4173;
const base = `http://localhost:${PORT}`;

const HOST_MARKER = 'data-entry="host"';
const CONTROLLER_MARKER = 'data-entry="controller"';
const PUBLIC_FILES = [
  '/favicon.ico',
  '/apple-icon.png',
  '/site.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
];
const HEAD_MUST = ['rel="manifest"', 'rel="apple-touch-icon"', 'fonts.googleapis.com'];
const HEAD_MUST_NOT = ['image/svg+xml'];

const failures = [];

async function get(path) {
  const res = await fetch(base + path, { redirect: 'follow' });
  return { status: res.status, body: await res.text() };
}

async function checkApp(app) {
  const appRoot = join(appsDir, app);
  const check = (ok, msg) => {
    if (!ok) failures.push(`${app}: ${msg}`);
  };
  if (!existsSync(join(appRoot, 'play.html'))) return check(false, `no apps/${app}/play.html`);

  const server = await preview({
    root: appRoot,
    configFile: join(appRoot, 'vite.config.ts'),
    logLevel: 'warn',
    preview: { port: PORT, strictPort: true, host: 'localhost', open: false },
  });

  try {
    const pages = [
      ['/', HOST_MARKER, CONTROLLER_MARKER],
      ['/play', CONTROLLER_MARKER, HOST_MARKER],
      ['/play?code=ABCD', CONTROLLER_MARKER, HOST_MARKER],
    ];
    for (const [path, want, notWant] of pages) {
      const { status, body } = await get(path);
      check(status === 200, `${path} → ${status}, expected 200`);
      check(body.includes(want), `${path} lacks ${want}`);
      check(!body.includes(notWant), `${path} contains ${notWant}`);
      for (const s of HEAD_MUST) check(body.includes(s), `${path} lacks ${s}`);
      for (const s of HEAD_MUST_NOT) check(!body.includes(s), `${path} contains ${s}`);
    }
    for (const path of PUBLIC_FILES) {
      const { status } = await get(path);
      check(status === 200, `${path} → ${status}, expected 200`);
    }
  } finally {
    await server.close();
  }
}

const apps = process.argv[2]
  ? [process.argv[2]]
  : readdirSync(appsDir).filter((d) => existsSync(join(appsDir, d, 'play.html')));
if (apps.length === 0) failures.push('no game apps found (apps/*/play.html)');
for (const app of apps) await checkApp(app);

if (failures.length > 0) {
  console.error(`check:routes FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log(`check:routes ok (${apps.join(', ')})`);
