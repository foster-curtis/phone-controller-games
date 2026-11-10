import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, BrowserContext, TestInfo } from '@playwright/test';
import { afterEach, describe, expect, it } from 'vitest';
import { IMPACT_DIR_ENV, readE2EConfig, recordImpact } from '../src/e2e';

const tmp = () => mkdtempSync(join(tmpdir(), 'pcg-e2e-'));

describe('readE2EConfig', () => {
  it('reads the ports and the exclusive flag', () => {
    const file = join(tmp(), 'package.json');
    writeFileSync(
      file,
      JSON.stringify({ pcg: { e2e: { relayPort: 8790, webPort: 5175, exclusive: true } } }),
    );
    expect(readE2EConfig(file)).toEqual({ relayPort: 8790, webPort: 5175, exclusive: true });
    writeFileSync(file, JSON.stringify({ pcg: { e2e: { relayPort: 8788, webPort: 5174 } } }));
    expect(readE2EConfig(file).exclusive).toBe(false);
  });

  it('throws when the ports are missing', () => {
    const file = join(tmp(), 'package.json');
    writeFileSync(file, JSON.stringify({ name: '@pcg/x', pcg: { e2e: { relayPort: 8788 } } }));
    expect(() => readE2EConfig(file)).toThrow('@pcg/x');
  });
});

/** A context that hands its 'request' listener to the test, and a browser that makes them. */
function fakes() {
  const listeners: ((r: { url(): string }) => void)[] = [];
  const makeContext = () =>
    ({
      on: (_event: string, fn: (r: { url(): string }) => void) => listeners.push(fn),
    }) as unknown as BrowserContext;
  const browser = { newContext: async () => makeContext() } as unknown as Browser;
  const request = (url: string) => listeners.forEach((fn) => fn({ url: () => url }));
  return { browser, makeContext, request, listenerCount: () => listeners.length };
}

describe('recordImpact', () => {
  afterEach(() => {
    delete process.env[IMPACT_DIR_ENV];
  });

  const info = { testId: 't1', file: '/app/e2e/smoke.spec.ts' } as TestInfo;

  it('does nothing without the env var', async () => {
    const { browser } = fakes();
    const original = browser.newContext;
    const rec = recordImpact(browser, info);
    expect(browser.newContext).toBe(original);
    rec.finish();
  });

  it('records requests from the fixture context and from browser.newContext, then restores it', async () => {
    const dir = tmp();
    process.env[IMPACT_DIR_ENV] = dir;
    const { browser, makeContext, request, listenerCount } = fakes();
    const original = browser.newContext;
    const rec = recordImpact(browser, info);
    const fixtureContext = makeContext();
    rec.watch(fixtureContext);
    rec.watch(fixtureContext); // once only
    await browser.newContext();
    expect(listenerCount()).toBe(2);
    request('http://localhost:5174/src/host/main.ts');
    request('http://localhost:5174/src/host/main.ts');
    request('http://localhost:5174/@vite/client');
    rec.finish();
    expect(browser.newContext).toBe(original);
    expect(readdirSync(dir)).toEqual(['t1.json']);
    expect(JSON.parse(readFileSync(join(dir, 't1.json'), 'utf8'))).toEqual({
      file: '/app/e2e/smoke.spec.ts',
      urls: ['http://localhost:5174/@vite/client', 'http://localhost:5174/src/host/main.ts'],
    });
  });
});
