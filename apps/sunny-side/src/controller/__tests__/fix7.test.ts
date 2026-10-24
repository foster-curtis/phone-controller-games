import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, sampleScreen } from './helpers';
import { sampleBreakdown } from '../dev';
import type { RoundBreakdown, Screen } from '../../shared/messages';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const q = (root: ParentNode, sel: string) => root.querySelector(sel) as HTMLElement;

describe('M5-fix-7 note 2: ghost KO text', () => {
  const bd = (ghost: boolean | undefined): RoundBreakdown => {
    const b = sampleBreakdown();
    const mine = b.players[0]!;
    mine.out = { by: null, byName: null, ...(ghost === undefined ? {} : { ghost }) };
    return b;
  };
  const show = (ghost: boolean | undefined) => {
    const h = mount();
    h.show({ ...sampleScreen('results'), breakdown: bd(ghost) } as Screen);
    return h;
  };

  it('says "Knocked out by ghost" in the own card and the compact list', () => {
    const h = show(true);
    expect(q(h.root, '[data-bd=mine] .bd-out').textContent).toBe('Knocked out by ghost');
    // The dev sample has one ghost KO among the other rows.
    const h2 = mount();
    h2.show(sampleScreen('results'));
    const rows = [...h2.root.querySelectorAll('[data-bd=row] .bd-detail')].map(
      (r) => r.textContent,
    );
    expect(rows.some((t) => t?.includes('Knocked out by ghost'))).toBe(true);
  });

  it('keeps "Fell off" when not a ghost', () => {
    expect(q(show(false).root, '[data-bd=mine] .bd-out').textContent).toBe('Fell off');
    expect(q(show(undefined).root, '[data-bd=mine] .bd-out').textContent).toBe('Fell off');
  });
});

describe('M5-fix-7 note 3: leader remove', () => {
  const removeBtns = (root: HTMLElement) => [
    ...root.querySelectorAll<HTMLButtonElement>('.remove-btn'),
  ];

  it('shows a remove control on every other entry, never the leader, only for the leader', () => {
    for (const kind of ['lobby', 'results', 'matchEnd', 'spectating'] as const) {
      const h = mount();
      const s = sampleScreen(kind);
      h.show(s);
      const ids = removeBtns(h.root).map((b) => b.dataset.remove);
      const others = s.standings.filter((x) => x.name !== s.name).map((x) => x.playerId);
      expect(ids).toEqual(others);
      const h2 = mount();
      h2.show({ ...s, isLeader: false } as Screen);
      expect(removeBtns(h2.root).length).toBe(0);
    }
  });

  it('marks away players dimmed with an "away" label', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    const away = q(h.root, '.standing.offline');
    expect(q(away, '.away').textContent).toBe('away');
    expect(away.querySelector('.remove-btn')).not.toBeNull();
  });

  it('needs a second tap within 3 s to send; otherwise disarms', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    let b = q(h.root, '[data-remove=p1]');
    b.click();
    expect(b.textContent).toBe('Remove?');
    expect(h.msgs().filter((m) => m.t === 'leader')).toEqual([]);
    vi.advanceTimersByTime(3000);
    expect(b.textContent).not.toBe('Remove?');
    b.click();
    vi.advanceTimersByTime(2000);
    // A screen update re-renders the list; the armed state survives it.
    h.show(sampleScreen('lobby'));
    b = q(h.root, '[data-remove=p1]');
    expect(b.textContent).toBe('Remove?');
    b.click();
    expect(h.msgs().filter((m) => m.t === 'leader')).toEqual([
      { t: 'leader', action: 'remove', playerId: 'p1' },
    ]);
  });
});

describe('M5-fix-7 note 4: removed phone', () => {
  it('shows the removed screen on kick; Join again clears the token and reloads', () => {
    const h = mount();
    h.show(sampleScreen('lobby'));
    h.storage.setItem('pcg:token:sunny-side:ABCD', 'tok');
    h.storage.setItem('pcg:token:sunny-side:ZZZZ', 'other');
    h.client.kick();
    expect(h.app.currentKind()).toBe('removed');
    const screen = q(h.root, '[data-screen=removed]');
    expect(screen.textContent).toContain('You were removed from the game');
    q(screen, 'button').click();
    expect(h.storage.getItem('pcg:token:sunny-side:ABCD')).toBeNull();
    expect(h.storage.getItem('pcg:token:sunny-side:ZZZZ')).toBe('other');
    expect(h.reloads).toEqual(['ABCD']);
  });

  it('keeps the left screen after a self-Leave', () => {
    const h = mount();
    h.show(sampleScreen('left'));
    h.client.kick();
    expect(h.app.currentKind()).toBe('left');
    expect(h.root.querySelector('[data-screen=removed]')).toBeNull();
  });
});

describe('M5-fix-7 note 5: emoji cooldown', () => {
  it('is 0.5 s', () => {
    const h = mount();
    h.show(sampleScreen('spectating'));
    const b = h.root.querySelectorAll<HTMLButtonElement>('.emoji-btn');
    b[0]!.click();
    vi.advanceTimersByTime(499);
    b[1]!.click();
    expect(h.msgs().filter((m) => m.t === 'emoji').length).toBe(1);
    vi.advanceTimersByTime(1);
    b[1]!.click();
    expect(h.msgs().filter((m) => m.t === 'emoji').length).toBe(2);
  });
});
