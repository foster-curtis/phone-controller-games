import { afterEach, describe, expect, it } from 'vitest';
import { openInstallSheet } from '../src/shell/installSheet';

const text = { title: 'T', body: 'B', close: 'Got it' };
afterEach(() => {
  document.body.replaceChildren();
});

describe('openInstallSheet', () => {
  it('renders the card with heading, body and a focused close button', () => {
    openInstallSheet(document.body, text);
    const card = document.querySelector('.pcg-sheet > .pcg-sheet-card')!;
    expect(card.querySelector('h2')!.textContent).toBe('T');
    expect(card.querySelector('p')!.textContent).toBe('B');
    const btn = card.querySelector('button')!;
    expect(btn.textContent).toBe('Got it');
    expect(document.activeElement).toBe(btn);
  });

  it('closes on the button', () => {
    openInstallSheet(document.body, text);
    document.querySelector('button')!.click();
    expect(document.querySelector('.pcg-sheet')).toBeNull();
  });

  it('closes on a backdrop tap but not a card tap', () => {
    openInstallSheet(document.body, text);
    (document.querySelector('.pcg-sheet-card') as HTMLElement).click();
    expect(document.querySelector('.pcg-sheet')).not.toBeNull();
    (document.querySelector('.pcg-sheet') as HTMLElement).click();
    expect(document.querySelector('.pcg-sheet')).toBeNull();
  });

  it('closes on Escape and via the returned function (twice is fine)', () => {
    const close = openInstallSheet(document.body, text);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.pcg-sheet')).toBeNull();
    const close2 = openInstallSheet(document.body, text);
    close2();
    close2();
    close();
    expect(document.querySelector('.pcg-sheet')).toBeNull();
  });
});
