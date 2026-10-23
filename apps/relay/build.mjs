// Bundles the relay (incl. @pcg/net-client TS source and ws) into one ESM file for Docker.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // ws loads these optional native add-ons in a try/catch.
  external: ['bufferutil', 'utf-8-validate'],
  // ws is CommonJS: give the ESM bundle a real `require` for Node built-ins.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});
