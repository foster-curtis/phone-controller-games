// Starts `vite preview` on 4173 against the built app and checks the routes and brand head.
// Run after `pnpm build`.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = join(root, 'apps', 'sunny-side');
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
const check = (ok, msg) => {
  if (!ok) failures.push(msg);
};

async function get(path) {
  const res = await fetch(base + path, { redirect: 'follow' });
  return { status: res.status, body: await res.text() };
}

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

if (failures.length > 0) {
  console.error(`check:routes FAILED:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
console.log('check:routes ok');
