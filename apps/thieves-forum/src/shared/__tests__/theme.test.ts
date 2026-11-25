// Parity test (SPEC §6.0): every value mirrored in theme.ts must equal its custom property / class in
// brand.css, and every brand.css color, spacing, radius, font and type token must be mirrored.
import { describe, expect, it } from 'vitest';
import brandCss from '../../styles/brand.css?raw';
import { PLAYER_COLOR_IDS, theme } from '../theme';

const css = brandCss.replace(/\/\*[\s\S]*?\*\//g, '');

/** `--name` → raw value, in source order. */
const vars = new Map<string, string>();
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
for (const m of rootBlock.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
  vars.set(m[1]!, m[2]!.trim().replace(/\s+/g, ' '));
}

function resolve(name: string): string {
  const raw = vars.get(name);
  if (raw === undefined) throw new Error(`brand.css has no --${name}`);
  return raw.replace(/var\(--([\w-]+)\)/g, (_, ref: string) => resolve(ref));
}

const kebab = (key: string) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const px = (v: string) => {
  const m = /^(-?[\d.]+)(px)?$/.exec(v);
  if (!m) throw new Error(`not a px length: ${v}`);
  return Number(m[1]);
};
const isHex = (v: string) => /^#[0-9a-f]{6}$/i.test(v);

function expectColor(name: string, token: { hex: string; num: number }) {
  const value = resolve(name).toLowerCase();
  expect(isHex(value), `--${name} = ${value}`).toBe(true);
  expect(token.hex, `--${name}`).toBe(value);
  expect(token.num, `--${name} (num)`).toBe(parseInt(value.slice(1), 16));
}

const names = [...vars.keys()];
const GROUPED = ['player-', 'fabric-', 'canopy-'];
const isGrouped = (n: string) => GROUPED.some((p) => n.startsWith(p));

describe('theme.ts mirrors brand.css', () => {
  it('parses brand.css', () => {
    expect(vars.size).toBeGreaterThan(80);
  });

  it('semantic colors', () => {
    for (const [key, token] of Object.entries(theme.color)) expectColor(kebab(key), token);
    const opaque = names.filter((n) => !isGrouped(n) && isHex(resolve(n)));
    expect(Object.keys(theme.color).map(kebab).sort()).toEqual(opaque.sort());
  });

  it('translucent colors', () => {
    for (const [key, token] of Object.entries(theme.translucent)) {
      const m = /^rgba\((\d+), ?(\d+), ?(\d+), ?([\d.]+)\)$/.exec(resolve(kebab(key)));
      expect(m, `--${kebab(key)}`).not.toBeNull();
      const [r, g, b, a] = m!.slice(1).map(Number) as [number, number, number, number];
      const num = (r << 16) | (g << 8) | b;
      expect(token.num, key).toBe(num);
      expect(token.hex, key).toBe(`#${num.toString(16).padStart(6, '0')}`);
      expect(token.alpha, key).toBe(a);
    }
    const rgba = names.filter((n) => resolve(n).startsWith('rgba('));
    expect(Object.keys(theme.translucent).map(kebab).sort()).toEqual(rgba.sort());
  });

  it.each([
    ['fabric', theme.fabric],
    ['canopy', theme.canopy],
  ] as const)('%s colors, in brand order', (prefix, group) => {
    const cssOrder = names.filter((n) => n.startsWith(`${prefix}-`));
    expect(Object.keys(group).map((k) => `${prefix}-${kebab(k)}`)).toEqual(cssOrder);
    for (const [key, token] of Object.entries(group)) expectColor(`${prefix}-${kebab(key)}`, token);
  });

  it('player colors, in brand order', () => {
    const cssOrder = names
      .filter((n) => n.startsWith('player-') && !n.endsWith('-on'))
      .map((n) => n.slice(7));
    expect(cssOrder).toEqual([...PLAYER_COLOR_IDS]);
    expect(Object.keys(theme.players)).toEqual([...PLAYER_COLOR_IDS]);
    for (const id of PLAYER_COLOR_IDS) {
      expectColor(`player-${id}`, theme.players[id].fill);
      expectColor(`player-${id}-on`, theme.players[id].on);
    }
  });

  it('font stacks', () => {
    for (const [key, stack] of Object.entries(theme.font))
      expect(stack, key).toBe(resolve(`font-${key}`));
    expect(Object.keys(theme.font).sort()).toEqual(
      names
        .filter((n) => n.startsWith('font-'))
        .map((n) => n.slice(5))
        .sort(),
    );
  });

  it('type scale', () => {
    const classes = new Map<string, string>();
    for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      if (/font:/.test(m[2]!)) classes.set(m[1]!, m[2]!);
    }
    expect(Object.keys(theme.type).map(kebab).sort()).toEqual([...classes.keys()].sort());
    for (const [key, style] of Object.entries(theme.type)) {
      const body = classes.get(kebab(key))!;
      const f = /font:\s*(\d+)\s+([\d.]+)px\/([\d.]+)(px)?\s+var\(--([\w-]+)\)/.exec(body);
      expect(f, `.${kebab(key)} font`).not.toBeNull();
      const [, weight, size, lh, lhPx, family] = f!;
      expect(style.weight, `${key} weight`).toBe(Number(weight));
      expect(style.size, `${key} size`).toBe(Number(size));
      const lineHeight = lhPx ? Number(lh) : Number(lh) * Number(size);
      expect(style.lineHeight, `${key} line-height`).toBeCloseTo(lineHeight, 6);
      expect(style.family, `${key} family`).toBe(resolve(family!));
      const ls = /letter-spacing:\s*([^;]+);/.exec(body)?.[1]?.trim();
      expect(style.letterSpacing, `${key} letter-spacing`).toBe(ls ? px(ls) : 0);
      expect(style.uppercase, `${key} uppercase`).toBe(/text-transform:\s*uppercase/.test(body));
    }
  });

  it('spacing', () => {
    for (const [key, value] of Object.entries(theme.space)) {
      expect(value, key).toBe(px(resolve(`space-${kebab(key)}`)));
    }
    expect(
      Object.keys(theme.space)
        .map((k) => `space-${kebab(k)}`)
        .sort(),
    ).toEqual(names.filter((n) => n.startsWith('space-')).sort());
  });

  it('radii', () => {
    const cssName = (key: string) => (key === 'base' ? 'radius' : `radius-${kebab(key)}`);
    for (const [key, value] of Object.entries(theme.radius))
      expect(value, key).toBe(px(resolve(cssName(key))));
    expect(Object.keys(theme.radius).map(cssName).sort()).toEqual(
      names.filter((n) => /^radius(-|$)/.test(n)).sort(),
    );
  });

  it('coin edge', () => {
    const m = /^([\d.]+)px dashed (#[0-9a-f]{6})$/i.exec(resolve('coin-edge'));
    expect(m).not.toBeNull();
    expect(theme.coinEdge.width).toBe(Number(m![1]));
    expect(theme.coinEdge.color.hex).toBe(m![2]!.toLowerCase());
    expect(theme.coinEdge.color.num).toBe(parseInt(m![2]!.slice(1), 16));
    expect(theme.coinEdge.offset).toBe(px(resolve('coin-edge-offset')));
  });

  it('mirrors every brand.css token', () => {
    const covered = (n: string) =>
      isGrouped(n) ||
      isHex(resolve(n)) ||
      resolve(n).startsWith('rgba(') ||
      /^(font|space|radius)(-|$)/.test(n) ||
      n.startsWith('coin-edge');
    expect(names.filter((n) => !covered(n))).toEqual([]);
  });
});
