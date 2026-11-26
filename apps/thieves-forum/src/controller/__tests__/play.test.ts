// Play screen and sheets (SPEC §3, §6.7, §6.17, §12.7): main button priority and labels, hold bars from
// the injected estimator (never 100% before `holdEnd complete`), toss cooldown, back-shelf dimming,
// stall view closing on `stallView null`, sheets, tip-off seam, toasts. jsdom.
import { describe, expect, it } from 'vitest';
import type { HoldEstimator, HoldEvent } from '../../shared/hold';
import { BIT_HOLD, type HostMsg } from '../../shared/messages';
import type { StallView } from '../../shared/viewer/types';
import { STALL } from '../samples';
import { resolveMain } from '../state';
import type { TipViewerFactory } from '../tipViewer';
import { mountApp, pointer } from './helpers';

/** An estimator whose progress the test sets; records calls. */
function stubEstimator() {
  const calls: string[] = [];
  let p = 0;
  const est: HoldEstimator & { set(v: number): void; calls: string[]; events: HoldEvent[] } = {
    calls,
    events: [],
    set: (v) => void (p = v),
    press: () => void calls.push('press'),
    correct: (e) => void est.events.push(e),
    progress: () => p,
    release: () => void calls.push('release'),
  };
  return est;
}

const context = (
  main: 'browse' | 'sell' | 'pickpocket' | null,
  extra: Partial<{ tossReadyInMs: number; tip: boolean; catch: boolean }> = {},
): HostMsg => ({ t: 'context', main, tossReadyInMs: 0, tip: false, catch: false, ...extra });

describe('main button', () => {
  it('priority BROWSE > SELL > PICKPOCKET', () => {
    expect(resolveMain(['pickpocket', 'sell', 'browse'])).toBe('browse');
    expect(resolveMain(['pickpocket', 'sell'])).toBe('sell');
    expect(resolveMain(['pickpocket'])).toBe('pickpocket');
    expect(resolveMain([])).toBeNull();
  });

  it('shows the host context label, blank and disabled with none', () => {
    const rig = mountApp();
    rig.sample('play');
    const main = rig.q<HTMLButtonElement>('[data-role=main]');
    expect(main.textContent).toBe('BROWSE');
    rig.emit(context('sell'));
    expect(main.textContent).toBe('SELL');
    rig.emit(context('pickpocket'));
    expect(main.textContent).toBe('PICKPOCKET');
    rig.emit(context(null));
    expect(main.textContent).toBe('');
    expect(main.disabled).toBe(true);
  });

  it('BROWSE and SELL send `browse` on press', () => {
    const rig = mountApp();
    rig.sample('play');
    pointer(rig.q('[data-role=main]'), 'pointerdown');
    pointer(rig.q('[data-role=main]'), 'pointerup');
    expect(rig.sent('browse')).toHaveLength(1);
  });

  it('PICKPOCKET holds the hold bit and shows a bar above the button', () => {
    const est = stubEstimator();
    const rig = mountApp({ estimator: est });
    rig.sample('play');
    rig.emit(context('pickpocket'));
    pointer(rig.q('[data-role=main]'), 'pointerdown');
    expect(est.calls).toEqual(['press']);
    const last = (rig.client.sent as { t: string; bits?: number }[])
      .filter((m) => m.t === 'input')
      .at(-1);
    expect(last!.bits! & BIT_HOLD).toBe(BIT_HOLD);
    est.set(0.5);
    rig.advance(16);
    expect(rig.q('.main-bar').dataset.progress).toBe('50');
    pointer(rig.q('[data-role=main]'), 'pointerup');
    expect(est.calls).toEqual(['press', 'release']);
    rig.advance(16);
    expect(rig.q('.main-bar').hidden).toBe(true);
  });
});

describe('stall view', () => {
  const open = (rig: ReturnType<typeof mountApp>, view: StallView = STALL) =>
    rig.emit({ t: 'stallView', view });

  it('renders counter and shelf rows with rarity and state', () => {
    const rig = mountApp();
    rig.sample('stall');
    expect(rig.qa('.tiles.counter .tile')).toHaveLength(4);
    expect(rig.qa('.tiles.shelf .tile')).toHaveLength(2);
    expect(rig.q('[data-slot="3"]').textContent).toContain('Too heavy');
    expect(rig.q('[data-slot="2"]').textContent).toContain('Taken');
    expect(rig.q('[data-slot="3"]').dataset.rarity).toBe('rare');
    expect(rig.q('.stall-head').textContent).toBe('Bakery');
  });

  it('back-shelf row dims unless outOfReach is false', () => {
    const rig = mountApp();
    rig.sample('stall');
    expect(rig.q('.tiles.shelf').classList.contains('dim')).toBe(true);
    expect(rig.q('[data-slot="4"]').classList.contains('dim')).toBe(true);
    open(rig, { ...STALL, shelf: STALL.shelf.map((i) => ({ ...i, state: 'free' as const })) });
    expect(rig.q('.tiles.shelf').classList.contains('dim')).toBe(false);
    expect(rig.q('[data-slot="4"]').classList.contains('dim')).toBe(false);
  });

  it('closes on a host `stallView null`', () => {
    const rig = mountApp();
    rig.sample('dialog');
    expect(rig.q('[data-sheet=stall]')).toBeTruthy();
    expect(rig.q('[data-sheet=dialog]')).toBeTruthy();
    rig.emit({ t: 'stallView', view: null });
    expect(rig.q('[data-sheet=stall]')).toBeNull();
    expect(rig.q('[data-sheet=dialog]')).toBeNull();
    expect(rig.q('[data-screen=play]')).toBeTruthy();
  });

  it('hold tile shows the estimator progress, never 100% before holdEnd complete', () => {
    const est = stubEstimator();
    const rig = mountApp({ estimator: est });
    rig.sample('stall');
    const tile = rig.q('[data-slot="1"]');
    pointer(tile, 'pointerdown');
    expect(rig.sent('grab')).toEqual([{ t: 'grab', stall: 3, slot: 1 }]);
    est.set(0.3);
    rig.advance(16);
    expect(tile.querySelector<HTMLElement>('.hold-bar')!.dataset.progress).toBe('30');
    rig.emit({
      t: 'holdStart',
      id: 7,
      kind: 'grab',
      durationMs: 700,
      elapsedMs: 50,
      stall: 3,
      slot: 1,
    });
    expect(est.events[0]).toMatchObject({ t: 'holdStart', id: 7 });
    est.set(1);
    rig.advance(16);
    expect(tile.querySelector<HTMLElement>('.hold-bar')!.dataset.progress).toBe('99');
    rig.emit({ t: 'holdEnd', id: 7, result: 'complete' });
    expect(tile.querySelector<HTMLElement>('.hold-bar')!.dataset.progress).toBe('100');
    rig.advance(600);
    expect(tile.querySelector<HTMLElement>('.hold-bar')!.dataset.progress).toBeUndefined();
  });

  it('a cancelled hold clears the bar; taken tiles cannot be pressed', () => {
    const est = stubEstimator();
    const rig = mountApp({ estimator: est });
    rig.sample('stall');
    pointer(rig.q('[data-slot="2"]'), 'pointerdown');
    expect(rig.sent('grab')).toHaveLength(0);
    pointer(rig.q('[data-slot="0"]'), 'pointerdown', 2);
    rig.emit({
      t: 'holdStart',
      id: 1,
      kind: 'grab',
      durationMs: 600,
      elapsedMs: 0,
      stall: 3,
      slot: 0,
    });
    rig.emit({ t: 'holdEnd', id: 1, result: 'cancelled' });
    pointer(rig.q('[data-slot="0"]'), 'pointerup', 2);
    est.set(0);
    rig.advance(16);
    expect(rig.q('[data-slot="0"] .hold-bar').hidden).toBe(true);
  });

  it('keeps tile elements across host updates (a held thumb survives)', () => {
    const rig = mountApp();
    rig.sample('stall');
    const before = rig.q('[data-slot="0"]');
    open(rig, {
      ...STALL,
      counter: STALL.counter.map((i) =>
        i.slot === 1 ? { ...i, state: 'takenByOther' as const } : i,
      ),
    });
    expect(rig.q('[data-slot="0"]')).toBe(before);
    expect(rig.q('[data-slot="1"]').dataset.state).toBe('takenByOther');
  });
});

describe('secondary buttons', () => {
  it('toss shows its cooldown and aims with the stick', () => {
    const rig = mountApp();
    rig.sample('play');
    rig.emit(context('browse', { tossReadyInMs: 5000 }));
    const toss = rig.q<HTMLButtonElement>('[data-role=toss]');
    expect(toss.disabled).toBe(true);
    expect(toss.textContent).toBe('Toss coin 5');
    rig.advance(2100);
    expect(toss.textContent).toBe('Toss coin 3');
    rig.advance(3000);
    expect(toss.disabled).toBe(false);
    expect(toss.textContent).toBe('Toss coin');
    toss.click();
    expect(rig.sent('toss')).toEqual([{ t: 'toss', x: 0, y: 0 }]);
  });

  it('Tip guard and Catch! follow the host context', () => {
    const rig = mountApp();
    rig.sample('play');
    rig.emit(context(null, { tip: false, catch: false }));
    expect(rig.q<HTMLButtonElement>('[data-role=tip]').disabled).toBe(true);
    expect(rig.q<HTMLButtonElement>('[data-role=catch]').disabled).toBe(true);
    rig.emit(context(null, { tip: true, catch: true }));
    rig.q('[data-role=tip]').click();
    expect(rig.sent('tipOpen')).toHaveLength(1);
    pointer(rig.q('[data-role=catch]'), 'pointerdown');
    const inputs = (rig.client.sent as { t: string; bits?: number }[]).filter(
      (m) => m.t === 'input',
    );
    expect(inputs.at(-1)!.bits! & 2).toBe(2);
  });
});

describe('sheets', () => {
  it('pawnbroker: offers per item, Sell to pawn, weight bar', () => {
    const rig = mountApp();
    rig.sample('pawn');
    expect(rig.q('[data-sheet=pawn] .weight').dataset.weight).toBe('4/15');
    rig.q('[data-sheet=pawn] [data-item=saffron-pouch]').click();
    expect(rig.sent('sell')).toEqual([{ t: 'sell', item: 'saffron-pouch', to: 'pawn' }]);
  });

  it('sell to NPC: matching items highlighted, the rest greyed', () => {
    const rig = mountApp();
    rig.sample('sell');
    const rows = rig.qa('[data-sheet=sell] .row');
    expect(rows.filter((r) => r.classList.contains('match'))).toHaveLength(1);
    expect(rows.filter((r) => r.classList.contains('grey'))).toHaveLength(2);
    expect(rig.q('[data-sheet=sell]').textContent).toContain('Pepper pouch');
    rig.q('[data-sheet=sell] [data-item=saffron-pouch]').click();
    expect(rig.sent('sell')).toEqual([{ t: 'sell', item: 'saffron-pouch', to: 7 }]);
  });

  it('merchant dialog: picks, Buy… and Ask about…', () => {
    const rig = mountApp();
    rig.sample('dialog');
    rig.q('[data-pick=browsing]').click();
    rig.q('[data-pick=buy]').click();
    rig.q('[data-sheet=dialog] [data-item=honey-jar]').click();
    rig.q('[data-sheet=dialog] .btn.quiet').click(); // Back
    rig.q('[data-pick=ask]').click();
    rig.q('[data-sheet=dialog] [data-slot="4"]').click();
    expect(rig.sent().filter((m) => m.t === 'dialog' || m.t === 'buy')).toEqual([
      { t: 'dialog', pick: 'browsing' },
      { t: 'buy', item: 'honey-jar' },
      { t: 'dialog', pick: 'ask', slot: 4 },
    ]);
    rig.emit({ t: 'dialog', open: false, buy: [], ask: [] });
    expect(rig.q('[data-sheet=dialog]')).toBeNull();
  });

  it('the coin pill opens the read-only pack sheet', () => {
    const rig = mountApp();
    rig.sample('play');
    rig.q('[data-role=coin-pill]').click();
    expect(rig.qa('[data-sheet=pack] .row')).toHaveLength(3);
    expect(rig.qa('[data-sheet=pack] .row button')).toHaveLength(0);
  });

  it('tip-off mounts the injected viewer, freezes the stick, sends and cancels', () => {
    let select: ((t: number | null) => void) | null = null;
    const viewer: TipViewerFactory = (o) => {
      select = o.onSelect;
      const el = document.createElement('div');
      el.dataset.tipViewer = 'stub';
      return { el, destroy: () => el.remove() };
    };
    const rig = mountApp({ tipViewer: viewer });
    rig.sample('tip');
    expect(rig.q('[data-tip-viewer=stub]')).toBeTruthy();
    expect(rig.q('.stick-zone').classList.contains('disabled')).toBe(true);
    const send = rig.q<HTMLButtonElement>('[data-action=tipSend]');
    expect(send.disabled).toBe(true);
    select!(2);
    send.click();
    expect(rig.sent('tipSend')).toEqual([{ t: 'tipSend', target: 2 }]);
    rig.emit({ t: 'tipResult', result: 'missed', fee: 10 });
    expect(rig.q('[data-sheet=tip]')).toBeNull();
    expect(rig.q('.stick-zone').classList.contains('disabled')).toBe(false);
    expect(document.querySelector('.pcg-toast')!.textContent).toBe('Tip missed −10');

    rig.sample('tip');
    rig.q('[data-action=tipCancel]').click();
    expect(rig.sent('tipCancel')).toHaveLength(1);
    expect(rig.q('[data-sheet=tip]')).toBeNull();
  });

  it('toasts are small; Lucky! is gold-edged', () => {
    const rig = mountApp();
    rig.sample('toast');
    const t = document.querySelector('.pcg-toast')!;
    expect(t.classList.contains('toast-lucky')).toBe(true);
    expect(t.textContent).toBe('Lucky! +19');
  });

  it('CAUGHT! banner on an in-person catch, then it clears', () => {
    const rig = mountApp();
    rig.sample('caught');
    expect(rig.q('.caught-banner').hidden).toBe(false);
    expect(rig.q('.caught-banner').textContent).toContain('18 d');
    rig.advance(4000);
    expect(rig.q('.caught-banner').hidden).toBe(true);
  });

  it('leaving play stops input and closes sheets', () => {
    const rig = mountApp();
    rig.sample('stall');
    rig.sample('handsUp');
    expect(rig.q('[data-sheet=stall]')).toBeNull();
    expect(rig.app.state.stall).toBeNull();
  });
});
