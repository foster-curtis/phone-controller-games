// Lint boundaries (SPEC §15.1): each fixture under src/host/{sim,systems,party}/__fixtures__ breaks its
// folder's rules on purpose; the repo's ESLint config must flag every one of them.
import { join } from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..', '..', '..');
const fixture = (folder: string) =>
  join(repoRoot, 'apps', 'fort-frenzy', 'src', 'host', folder, '__fixtures__', 'bad.ts');

async function lint(
  folder: string,
): Promise<{ rule: string | null; line: number; text: string }[]> {
  const eslint = new ESLint({ cwd: repoRoot, ignore: false });
  const [result] = await eslint.lintFiles([fixture(folder)]);
  return result!.messages.map((m) => ({ rule: m.ruleId, line: m.line, text: m.message }));
}

const has = (msgs: Awaited<ReturnType<typeof lint>>, rule: string, text: string) =>
  msgs.some((m) => m.rule === rule && m.text.includes(text));

describe('ESLint boundaries', () => {
  it('src/host/sim: no phaser, net-client, themes, DOM or wall clock / Math.random', async () => {
    const msgs = await lint('sim');
    expect(has(msgs, 'no-restricted-imports', "'phaser'")).toBe(true);
    expect(has(msgs, 'no-restricted-imports', "'@pcg/net-client'")).toBe(true);
    expect(has(msgs, 'no-restricted-imports', 'themes/types')).toBe(true);
    expect(has(msgs, 'no-restricted-globals', "'document'")).toBe(true);
    expect(has(msgs, 'no-restricted-properties', 'Math.random')).toBe(true);
    expect(has(msgs, 'no-restricted-properties', 'Date.now')).toBe(true);
    expect(has(msgs, 'no-restricted-properties', 'performance.now')).toBe(true);
    expect(has(msgs, 'no-restricted-syntax', 'wall clock')).toBe(true);
  }, 30_000);

  it('src/host/systems: no content, sim or other app folders; no DOM; determinism', async () => {
    const msgs = await lint('systems');
    expect(has(msgs, 'no-restricted-imports', 'content/types')).toBe(true);
    expect(has(msgs, 'no-restricted-imports', 'sim/types')).toBe(true);
    expect(has(msgs, 'no-restricted-imports', 'shared/ids')).toBe(true);
    expect(has(msgs, 'no-restricted-globals', "'window'")).toBe(true);
    expect(has(msgs, 'no-restricted-properties', 'Math.random')).toBe(true);
  }, 30_000);

  it('src/host/party: no content, sim, other app folders, net-client or DOM', async () => {
    const msgs = await lint('party');
    expect(has(msgs, 'no-restricted-imports', 'content/types')).toBe(true);
    expect(has(msgs, 'no-restricted-imports', 'sim/types')).toBe(true);
    expect(has(msgs, 'no-restricted-imports', 'shared/messages')).toBe(true);
    expect(has(msgs, 'no-restricted-imports', "'@pcg/net-client'")).toBe(true);
    expect(has(msgs, 'no-restricted-globals', "'localStorage'")).toBe(true);
  }, 30_000);

  it('the fixtures are skipped by the normal lint run', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    expect(await eslint.isPathIgnored(fixture('sim'))).toBe(true);
  });
});
