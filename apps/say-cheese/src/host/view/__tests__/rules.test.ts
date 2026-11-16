// @vitest-environment jsdom
// TV rules overview on the shared kit's shell (SPEC §6.2.1, PLATFORM #12): the classes tv.css and the
// e2e specs rely on, the card's SVG in the slot, and the shell's lifetime across repaints.
import { describe, expect, it } from 'vitest';
import { galleryViews } from '../../gallery';
import { noopSfx } from '../../../shared/sfx';
import type { HostControl } from '../../match/types';
import { renderTv } from '..';

const emitted: HostControl[] = [];
const controls = { emit: (c: HostControl) => void emitted.push(c), sfx: noopSfx, origin: 'x' };
const rules = (card: number) => ({ phase: 'rules' as const, card, cards: 5 });

describe('renderTv rules', () => {
  it('keeps the existing hooks', () => {
    const root = document.createElement('div');
    renderTv(root, rules(2), controls);
    const view = root.querySelector('.view.rules') as HTMLElement;
    expect(view.tagName).toBe('SECTION');
    expect(view.dataset.card).toBe('2');
    expect(view.querySelector('h1.banner')?.textContent).toBe('House rules.');
    expect(view.querySelector('p.rule-text')?.textContent).toContain('no hiding behind couches');
    expect(view.querySelectorAll('.dots .dot')).toHaveLength(5);
    expect(view.querySelectorAll('.dots .dot.on')).toHaveLength(1);
    expect(view.querySelectorAll('.dots .dot')[2]!.classList.contains('on')).toBe(true);
    expect(view.querySelector('p.caption.hint')?.textContent).toBe('Leader: Next / Skip');
    expect(view.dataset.tv).toBe('rules');
  });

  it('mounts the card illustration in the slot', () => {
    const root = document.createElement('div');
    renderTv(root, rules(0), controls);
    const art = root.querySelector('.pcg-rules__slot > .rule-art')!;
    expect(art.getAttribute('aria-hidden')).toBe('true');
    expect(art.querySelector('svg')).not.toBeNull();
  });

  it('reuses the shell for a repaint (no replayed fade) and replaces it per card', () => {
    const root = document.createElement('div');
    renderTv(root, rules(1), controls);
    const first = root.querySelector('.view.rules')!;
    expect(first.classList.contains('enter')).toBe(true);
    renderTv(root, rules(1), controls);
    const again = root.querySelector('.view.rules')!;
    expect(again).toBe(first);
    expect(again.classList.contains('enter')).toBe(false);
    renderTv(root, rules(2), controls);
    const next = root.querySelector('.view.rules')!;
    expect(next).not.toBe(first);
    expect(next.classList.contains('enter')).toBe(true);
    expect(first.querySelector('.rule-art')).toBeNull(); // old shell destroyed with its art
  });

  it('destroys the shell when the phase changes', () => {
    const root = document.createElement('div');
    renderTv(root, rules(0), controls);
    const first = root.querySelector('.view.rules')!;
    renderTv(
      root,
      galleryViews().find((v) => v.phase === 'matchEnd')!,
      controls,
    );
    expect(first.querySelector('.rule-art')).toBeNull();
    renderTv(root, rules(0), controls);
    expect(root.querySelector('.view.rules')).not.toBe(first);
  });

  it('does not bind keys itself (controls.ts owns them)', () => {
    emitted.length = 0;
    const root = document.createElement('div');
    document.body.append(root);
    renderTv(root, rules(0), controls);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(emitted).toEqual([]);
    root.remove();
  });
});
