// TF5-fix-1: toasts are top-anchored and the main button is a coin (circle) with a ring hold bar (SPEC §6.17).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/styles/controller.css'), 'utf8');
const rule = (sel: string): string => {
  const re = new RegExp(`(?:^|\\n)${sel.replace(/[.]/g, '\\.')}\\s*\\{([^}]*)\\}`, 'g');
  return [...css.matchAll(re)].map((m) => m[1]).join('\n');
};

describe('controller layout rules', () => {
  it('anchors toasts to the top, overriding the kit bottom', () => {
    const r = rule('.pcg-toast');
    expect(r).toMatch(/top:\s*calc\(/);
    expect(r).toMatch(/bottom:\s*auto\s*!important/);
    expect(r).toMatch(/safe-area-inset-top/);
  });
  it('makes the main button a circle: square coin box, 50% radius', () => {
    expect(rule('.main-wrap')).toMatch(/width:\s*var\(--coin\)[\s\S]*height:\s*var\(--coin\)/);
    expect(rule('.btn.main')).toMatch(/border-radius:\s*50%/);
    expect(rule('.main-bar')).toMatch(/border-radius:\s*50%/);
  });
  it('scales with the viewport and respects safe areas', () => {
    expect(rule('.actions')).toMatch(/clamp\(.*vmin/);
    expect(rule('.actions')).toMatch(/safe-area-inset-bottom/);
  });
});
