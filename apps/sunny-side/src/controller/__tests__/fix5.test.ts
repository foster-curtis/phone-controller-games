import { describe, expect, it } from 'vitest';
import { mount, sampleScreen } from './helpers';
import { sampleBreakdown } from '../dev';
import type { RoundBreakdown, Screen } from '../../shared/messages';

type WithBd = Extract<Screen, { kind: 'results' | 'matchEnd' }>;

const custom = (): RoundBreakdown => ({
  round: 4,
  players: [
    {
      playerId: 'a',
      name: 'Benedict_1',
      color: 'crimson',
      points: 9,
      total: 20,
      left: false,
      items: [
        { kind: 'ko', victimId: 'b', victimName: 'Kai', points: 2 },
        { kind: 'survivor', points: 7 },
      ],
      out: null,
    },
    {
      playerId: 'b',
      name: 'Kai',
      color: 'cobalt',
      points: 0,
      total: 3,
      left: false,
      items: [],
      out: { by: 'a', byName: 'Benedict_1' },
    },
    {
      playerId: 'c',
      name: 'Zed',
      color: 'jade',
      points: 0,
      total: 1,
      left: true,
      items: [],
      out: { by: null, byName: null },
    },
  ],
});

describe.each(['results', 'matchEnd'] as const)('%s breakdown', (kind) => {
  const show = (breakdown: RoundBreakdown | null | undefined, name = 'Benedict_1') => {
    const h = mount();
    h.show({ ...(sampleScreen(kind) as WithBd), name, breakdown });
    return h.root;
  };

  it('renders own entry first, highlighted in the player color, with item points from data', () => {
    const root = show(custom());
    const sec = root.querySelector('[data-section=breakdown]')!;
    expect(sec.querySelector('.bd-title')!.textContent).toBe('Round 4');
    const mine = sec.querySelector('[data-bd=mine]') as HTMLElement;
    expect(sec.children[1]).toBe(mine);
    expect(mine.style.background).toContain('var(--player-crimson)');
    expect(mine.style.color).toContain('var(--player-crimson-on)');
    const t = mine.textContent!;
    expect(t).toContain('+9 this round');
    expect(t).toContain('KO Kai +2');
    expect(t).toContain('Survivor +7');
    expect(t).toContain('Total 20');
    expect(t).toContain('Survived');
    expect(sec.querySelectorAll('[data-bd=row]').length).toBe(2);
  });

  it('others show knocked out / fell off, and left rows are greyed', () => {
    const root = show(custom());
    const rows = [...root.querySelectorAll('[data-bd=row]')];
    expect(rows[0]!.textContent).toContain('Kai');
    expect(rows[0]!.textContent).toContain('Knocked out by Benedict_1');
    expect(rows[0]!.classList.contains('left')).toBe(false);
    expect(rows[1]!.textContent).toContain('Fell off');
    expect(rows[1]!.classList.contains('left')).toBe(true);
  });

  it('spectators see the list without a highlighted card', () => {
    const root = show(custom(), 'Nobody');
    expect(root.querySelector('[data-bd=mine]')).toBeNull();
    expect(root.querySelectorAll('[data-bd=row]').length).toBe(3);
  });

  it('renders no section when breakdown is null or absent', () => {
    expect(show(null).querySelector('[data-section=breakdown]')).toBeNull();
    expect(show(undefined).querySelector('[data-section=breakdown]')).toBeNull();
    expect(show(null).querySelector(`[data-screen=${kind}]`)).not.toBeNull();
  });

  it('dev sample has 8 entries and renders', () => {
    const b = sampleBreakdown();
    expect(b.players.length).toBe(8);
    const root = show(b);
    expect(root.querySelectorAll('[data-bd=row]').length).toBe(7);
  });
});
