// Disguise invariants for the TV scene (SPEC §6.11, §12.2, §12.3; BUILD_PLAN TF7): the scene builds
// characters only from `WorldView` (it imports no player state), and the dev overlay, which names
// players, is only reachable behind the debug switch.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHARACTER_VIEW_KEYS } from '../../sim/snapshot';
import { createRuntime } from '../../game';
import { fakeHostClient } from '../../net/__tests__/fakeClient';

const HOST = join(__dirname, '..', '..');
const SCENE = join(HOST, 'scene');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return f === '__tests__' ? [] : files(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

/** Every module specifier a file imports (static, type-only and dynamic). */
function imports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) out.push(m[1]!);
  return out;
}

describe('scene disguise', () => {
  const sceneFiles = files(SCENE).filter((f) => !f.endsWith('overlay.ts'));

  it('scene modules read only WorldView from the sim and no player state', () => {
    expect(sceneFiles.length).toBeGreaterThan(2);
    for (const f of sceneFiles) {
      const src = readFileSync(f, 'utf8');
      for (const spec of imports(src)) {
        const name = relative(HOST, f);
        if (spec.includes('/sim/')) expect(spec, name).toMatch(/\/sim\/snapshot$/);
        expect(spec, name).not.toMatch(
          /(roster|\/game|\/net|\/match|ledger|messages|overlay|debug)/,
        );
      }
      expect(src).not.toMatch(/\b(DebugView|playerId|PlayerId|isPlayer|control)\b/);
    }
  });

  it('the overlay is imported only by main.ts, dynamically and inside the debug branch', () => {
    const importers = files(HOST).filter((f) =>
      imports(readFileSync(f, 'utf8')).some((s) => /(^|\/)overlay$/.test(s)),
    );
    expect(importers.map((f) => relative(HOST, f))).toEqual(['main.ts']);
    const main = readFileSync(join(HOST, 'main.ts'), 'utf8');
    expect(main).not.toMatch(/from\s+['"]\.\/scene\/overlay['"]/);
    const gate = main.indexOf('if (debug) {');
    const at = main.indexOf("import('./scene/overlay')");
    expect(gate).toBeGreaterThan(0);
    expect(at).toBeGreaterThan(gate);
    // ...before that branch closes.
    expect(main.slice(gate, at)).not.toMatch(/\n {2}\}\n/);
    expect(main).toMatch(/const debug = debugEnabled\(/);
  });

  it('debug hooks load only through the same debug branch', () => {
    const main = readFileSync(join(HOST, 'main.ts'), 'utf8');
    expect(main).not.toMatch(/from\s+['"]\.\/debug['"]/);
    expect(main.indexOf("import('./debug')")).toBeGreaterThan(main.indexOf('if (debug) {'));
  });

  it("the runtime's frame carries only allowlisted character keys", () => {
    const fake = fakeHostClient();
    const rt = createRuntime({ client: fake.client, origin: 'http://tv', seed: 7 });
    fake.join('p1', 'Livia');
    fake.join('p2', 'Marcus');
    expect(rt.start('p1')).toBe(true);
    for (let i = 0; i < 400; i++) rt.tick(16);
    const f = rt.frame(16)!;
    expect(f.view.characters.length).toBeGreaterThanOrEqual(2);
    for (const c of f.view.characters)
      expect(Object.keys(c).sort()).toEqual([...CHARACTER_VIEW_KEYS].sort());
  });
});
