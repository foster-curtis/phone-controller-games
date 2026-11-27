// Host message-handler and context registries (SPEC §12.5, §6.17; BUILD_PLAN TF12): one handler file per
// discrete message found by glob, BROWSE > SELL > PICKPOCKET order, and stall-view sends coalesced to
// at most one per STALL_VIEW_MIN_MS per phone (risk fallback: jitter on fast changes).
import { describe, expect, it } from 'vitest';
import { CONTENT } from '../../../content';
import { createPhoneRouter, STALL_VIEW_MIN_MS } from '../phone';
import { loadContextProviders, loadHandlers, mainAction } from '../registry';
import type { ContextProvider } from '../types';
import { createSim } from '../../sim/world';
import type { HostMsg } from '../../../shared/messages';

describe('handler registry', () => {
  it('has one handler per TF12 message', () => {
    const h = loadHandlers();
    for (const t of ['join', 'input', 'browse', 'grab', 'dialog', 'color', 'ready', 'leader'])
      expect(h.get(t as never)?.t, t).toBe(t);
  });

  it('refuses two handlers for one tag', () => {
    const one = { t: 'browse', handle() {} } as never;
    expect(() => loadHandlers({ './a.ts': one, './b.ts': one })).toThrow(/two handlers/);
  });

  it('orders providers by main-button priority', () => {
    const p = (action: ContextProvider['action'], on: boolean): ContextProvider => ({
      action,
      available: () => on,
    });
    const list = loadContextProviders({
      './pickpocket.ts': p('pickpocket', true),
      './sell.ts': p('sell', true),
      './browse.ts': p('browse', false),
    });
    expect(list.map((x) => x.action)).toEqual(['browse', 'sell', 'pickpocket']);
    expect(mainAction(list, {} as never)).toBe('sell');
    expect(loadContextProviders().map((x) => x.action)).toContain('browse');
  });
});

describe('phone router', () => {
  it('sends a stall view at once on open and coalesces later changes', () => {
    const sim = createSim({
      seed: 3,
      round: 1,
      players: [{ id: 'p1', side: { kind: 'player', id: 'p1' } }],
      openStalls: CONTENT.layout.stalls.map((s) => s.id),
      guards: 0,
    });
    sim.step();
    const sent: { msg: HostMsg; to: string }[] = [];
    const char = sim.world.characters[0]!;
    const r = createPhoneRouter({
      content: CONTENT,
      world: () => sim.world,
      ledger: () => null,
      character: () => char,
      send: (msg, to) => void sent.push({ msg, to }),
      timeScale: () => 1,
      providers: [],
      onReleased: () => {},
    });
    const views = () => sent.filter((s) => s.msg.t === 'stallView');
    const stall = sim.world.stalls.find((s) => s.slots.length > 0)!;
    r.event({ ch: 'phone', player: 'p1', e: 'stallView', stall: stall.id }, 0);
    expect(views()).toHaveLength(1);
    // A change: the next send waits for the window.
    stall.slots[0]!.item = null;
    r.event({ ch: 'phone', player: 'p1', e: 'stallView', stall: stall.id }, 10);
    r.flush(20);
    expect(views()).toHaveLength(1);
    r.flush(STALL_VIEW_MIN_MS);
    expect(views()).toHaveLength(2);
    // Walking away closes it at once.
    r.event({ ch: 'phone', player: 'p1', e: 'stallView', stall: null }, STALL_VIEW_MIN_MS + 1);
    expect(views().at(-1)!.msg).toEqual({ t: 'stallView', view: null });
    expect(sent.every((s) => s.to === 'p1')).toBe(true);
  });
});
