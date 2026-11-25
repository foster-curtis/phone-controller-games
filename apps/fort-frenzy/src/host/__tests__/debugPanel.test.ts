// @vitest-environment jsdom
// The debug panel's Cards section and `__pcg` card hooks (SPEC §9.5, RD6-fix-2): each knight's card
// list (shared commons + its own), "needs" labels, the give and its refusals, the panel driving a real
// runtime, and none of it without debug (main.ts loads debug.ts only behind `debugEnabled`).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostClient } from '@pcg/net-client';
import { content } from '../../content';
import { presentationShared } from '../../presentation/shared';
import { KNIGHT_IDS } from '../../shared/ids';
import { PROTOCOL_VERSION, type Intent } from '../../shared/messages';
import { installFfDebug, mountDebugPanel } from '../debug';
import { cardChoices, giveMessage } from '../debugInfo';
import { createRuntime } from '../game';
import { memorySnapshotStore } from '../net/resume';

const NAMES = presentationShared.names;

describe('card picker list', () => {
  it('is the shared commons then the knight’s own cards, for every knight', () => {
    for (const k of KNIGHT_IDS) {
      const ids = cardChoices(content, k, {}, NAMES).map((c) => c.id);
      const commons = content.cards.filter((c) => c.owner === 'common').map((c) => c.id);
      const own = content.cards.filter((c) => c.owner === k).map((c) => c.id);
      expect(ids).toEqual([...commons, ...own]);
      expect(own.length).toBeGreaterThan(0);
      // Its unique passive is in the list.
      expect(
        cardChoices(content, k, {}, NAMES).some((c) => c.unique && c.group.endsWith('rares')),
      ).toBe(true);
    }
  });

  it('groups by owner and tier, and labels unique, needs and stacks', () => {
    const list = cardChoices(content, 'ranger', { fire_arrows: 1, vitality: 2 }, NAMES);
    const by = (id: string) => list.find((c) => c.id === id)!;
    expect(by('vitality')).toMatchObject({ group: 'Shared commons', label: 'Vitality ×2' });
    expect(by('quick_draw').group).toBe('Ranger commons');
    expect(by('steady_aim')).toMatchObject({
      group: 'Ranger rares',
      label: 'Steady Aim (rare, unique)',
      unique: true,
    });
    expect(by('deadeye')).toMatchObject({
      label: 'Deadeye (rare) (needs Steady Aim)',
      needs: ['steady_aim'],
    });
    expect(by('wildfire')).toMatchObject({
      group: 'Ranger combos',
      label: 'Wildfire (combo) (needs Piercing Shot)',
      unique: true,
    });
    const owned = cardChoices(content, 'ranger', { steady_aim: 1 }, NAMES);
    expect(owned.find((c) => c.id === 'deadeye')!.needs).toEqual([]);
  });
});

describe('give check', () => {
  const w = () => {
    const h = { players: [{ slot: 0, classId: 'warden', cards: { challenger: 1 } }] };
    return h as unknown as Parameters<typeof giveMessage>[0];
  };
  it('refuses a second unique, another knight’s card, no run and no knight', () => {
    expect(giveMessage(w(), content, 0, 'challenger', NAMES)).toBe(
      'Challenger is unique: the Warden in slot 0 already has it',
    );
    expect(giveMessage(w(), content, 0, 'steady_aim', NAMES)).toBe(
      'Steady Aim is not a Warden card',
    );
    expect(giveMessage(w(), content, 3, 'might', NAMES)).toBe('No knight in slot 3');
    expect(giveMessage(null, content, 0, 'might', NAMES)).toMatch(/No run/);
    // Requires never refuses (Fault Line without Aftershock or Earthshaker).
    expect(giveMessage(w(), content, 0, 'fault_line', NAMES)).toBeNull();
  });
});

function runtime() {
  const subs = { msg: [] as ((from: string, data: unknown) => void)[] };
  const peers: ((c: { event: 'joined'; playerId: string; playerKey: string }) => void)[] = [];
  const client = {
    status: 'open',
    code: 'ABCD',
    closeReason: null,
    start: () => Promise.resolve({ code: 'ABCD', reclaimed: false, roster: [] }),
    send: () => {},
    lock: () => {},
    unlock: () => {},
    kick: () => {},
    close: () => {},
    onMessage: (cb: (from: string, data: unknown) => void) => (subs.msg.push(cb), () => {}),
    onPeer: (cb: (typeof peers)[number]) => (peers.push(cb), () => {}),
    onRoom: () => () => {},
    onStatus: () => () => {},
    onError: () => () => {},
  } as unknown as HostClient;
  const clock = { t: 0 };
  const rt = createRuntime({
    client,
    origin: 'http://tv.test',
    seed: 7,
    store: memorySnapshotStore(),
    now: () => clock.t,
  });
  let seq = 0;
  const intent = (id: string, i: Intent) =>
    subs.msg.forEach((cb) => cb(id, { t: 'intent', seq: ++seq, intent: i }));
  const join = (id: string, name: string, classId: 'ranger' | 'warden') => {
    peers.forEach((cb) => cb({ event: 'joined', playerId: id, playerKey: `key-${id}` }));
    subs.msg.forEach((cb) => cb(id, { t: 'hello', proto: PROTOCOL_VERSION, deviceId: `d-${id}` }));
    intent(id, { k: 'name', name });
    intent(id, { k: 'class', classId });
  };
  const run = (ms: number) => {
    for (let i = 0; i < ms; i += 50) {
      clock.t += 50;
      rt.tick(50);
    }
  };
  return { rt, intent, join, run };
}

describe('debug panel: Cards section', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
    delete window.__pcg;
  });

  it('lists the knights, gives a card through the panel and the hook, and refuses a second unique', () => {
    vi.useFakeTimers();
    const { rt, intent, join, run } = runtime();
    join('a', 'Ann', 'ranger');
    join('b', 'Bob', 'warden');
    const panel = mountDebugPanel(rt);
    installFfDebug(rt, () => 0);
    const $ = <T extends Element>(sel: string) => document.querySelector<T>(sel)!;
    // The lobby: knights chosen, no run slots to give to.
    expect($('[data-debug=knights]').textContent).toContain('Ranger (Ann)');
    expect($<HTMLSelectElement>('[data-debug=card-slot]').options.length).toBe(0);

    intent('a', { k: 'ready', ready: true });
    intent('b', { k: 'ready', ready: true });
    for (let i = 0; i < 400 && rt.world?.phase !== 'build'; i++) run(50);
    expect(rt.world?.phase).toBe('build');
    vi.advanceTimersByTime(500);
    const lines = [...document.querySelectorAll('[data-debug=knights] > div')].map(
      (d) => d.textContent,
    );
    expect(lines).toEqual([
      '0 · cobalt · Ranger (Ann) · no cards',
      '1 · jade · Warden (Bob) · no cards',
    ]);

    // Pick the Warden and his unique passive.
    const who = $<HTMLSelectElement>('[data-debug=card-slot]');
    who.value = '1';
    who.dispatchEvent(new Event('change'));
    const pick = $<HTMLSelectElement>('[data-debug=card]');
    const groups = [...pick.querySelectorAll('optgroup')].map((g) => g.label);
    expect(groups).toEqual(['Shared commons', 'Warden commons', 'Warden rares', 'Warden combos']);
    expect([...pick.options].find((o) => o.value === 'fault_line')!.text).toBe(
      'Fault Line (combo) (needs Aftershock + Earthshaker)',
    );
    pick.value = 'challenger';
    $<HTMLButtonElement>('[data-debug=give-card]').click();
    expect($('[data-debug=card-msg]').textContent).toBe('Gave Challenger to slot 1');
    run(50);
    expect(rt.world!.players[1]!.cards).toEqual({ challenger: 1 });
    expect(rt.world!.players[1]!.mods.some((m) => m.id === 'card:challenger')).toBe(true);
    vi.advanceTimersByTime(500);
    expect($('[data-debug=knights]').textContent).toContain('Warden (Bob) · Challenger');

    // A second copy is refused with a message, and nothing is sent.
    pick.value = 'challenger';
    $<HTMLButtonElement>('[data-debug=give-card]').click();
    expect($('[data-debug=card-msg]').textContent).toBe(
      'Challenger is unique: the Warden in slot 1 already has it',
    );

    // The hook: in combat too, requires bypassed.
    intent('a', { k: 'ready', ready: true });
    intent('b', { k: 'ready', ready: true });
    for (let i = 0; i < 40 && rt.world?.phase !== 'combat'; i++) run(50);
    expect(rt.world?.phase).toBe('combat');
    const api = window.__pcg!;
    expect(api.knights().map((k) => [k.slot, k.classId])).toEqual([
      [0, 'ranger'],
      [1, 'warden'],
    ]);
    expect(api.cardChoices(0).map((c) => c.id)).toContain('deadeye');
    expect(api.giveCard(0, 'deadeye')).toBeNull();
    expect(api.giveCard(0, 'challenger')).toBe('Challenger is not a Ranger card');
    expect(api.giveCard(1, 'challenger')).toMatch(/is unique/);
    run(50);
    // (The build phase's end also auto-picked a card from the offer.)
    expect(rt.world!.players[0]!.cards.deadeye).toBe(1);
    panel.destroy();
  });
});

describe('without debug', () => {
  const host = join(import.meta.dirname, '..');

  it('main.ts loads the panel and hooks only behind debugEnabled', () => {
    const main = readFileSync(join(host, 'main.ts'), 'utf8');
    expect(main).toMatch(/const debug = debugEnabled\(import\.meta\.env\.DEV\);/);
    expect(main).toMatch(
      /if \(debug\) \{\s+const \[\{ installFfDebug, mountDebugPanel \}\] = await Promise\.all\(\[import\('\.\/debug'\)\]\);/,
    );
    // Nothing else in the host's shipped code imports debug.ts.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) {
          if (f !== '__tests__' && f !== '__fixtures__') walk(p);
        } else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk(host);
    const importers = files.filter((f) =>
      /from '(\.\/|\.\.\/)+debug'|import\('(\.\/|\.\.\/)+debug'\)/.test(readFileSync(f, 'utf8')),
    );
    expect(importers.map((f) => f.slice(host.length + 1).replace(/\\/g, '/'))).toEqual(['main.ts']);
  });

  it('a runtime alone has no panel and no hooks', () => {
    runtime();
    expect(document.getElementById('ff-debug')).toBeNull();
    expect(window.__pcg).toBeUndefined();
  });
});
