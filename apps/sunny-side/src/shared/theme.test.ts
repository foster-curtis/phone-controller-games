// Parity test: every value mirrored in theme.ts must equal its custom property / class in brand.css,
// and every brand.css color, spacing, radius, stroke, shadow and tilt token must be mirrored.
import { describe, expect, it } from 'vitest';
import brandCss from '../styles/brand.css?raw';
import { PLAYER_COLOR_IDS } from './messages';
import { theme } from './theme';

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
const isPlayerVar = (n: string) => n.startsWith('player-');

describe('theme.ts mirrors brand.css', () => {
  it('parses brand.css', () => {
    expect(vars.size).toBeGreaterThan(50);
  });

  it('semantic colors', () => {
    for (const [key, token] of Object.entries(theme.color)) expectColor(kebab(key), token);
    const opaque = names.filter((n) => !isPlayerVar(n) && isHex(resolve(n)));
    expect(Object.keys(theme.color).map(kebab).sort()).toEqual(opaque.sort());
  });

  it('translucent colors (steam, scrim)', () => {
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

  it('player colors, in brand order', () => {
    const cssOrder = names
      .filter((n) => isPlayerVar(n) && !n.endsWith('-on'))
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
    for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) classes.set(m[1]!, m[2]!);
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

  it('radii (all but --radius-round)', () => {
    const cssName = (key: string) => (key === 'base' ? 'radius' : `radius-${kebab(key)}`);
    for (const [key, value] of Object.entries(theme.radius))
      expect(value, key).toBe(px(resolve(cssName(key))));
    expect(resolve('radius-round')).toBe('50%');
    expect(Object.keys(theme.radius).map(cssName).sort()).toEqual(
      names.filter((n) => /^radius(-|$)/.test(n) && n !== 'radius-round').sort(),
    );
  });

  it('strokes', () => {
    for (const [key, value] of Object.entries(theme.stroke))
      expect(value, key).toBe(px(resolve(`stroke-${key}`)));
    expect(Object.keys(theme.stroke).length).toBe(
      names.filter((n) => n.startsWith('stroke-')).length,
    );
  });

  it('shadows', () => {
    for (const [key, shadow] of Object.entries(theme.shadow)) {
      const parts = resolve(`shadow-${kebab(key)}`).split(' ');
      expect(parts.length, key).toBe(4);
      const [x, y, blur, color] = parts as [string, string, string, string];
      expect([shadow.x, shadow.y, shadow.blur], key).toEqual([px(x), px(y), px(blur)]);
      expect(shadow.color.hex, key).toBe(color.toLowerCase());
      expect(shadow.color.num, key).toBe(parseInt(color.slice(1), 16));
    }
    expect(Object.keys(theme.shadow).length).toBe(
      names.filter((n) => n.startsWith('shadow-')).length,
    );
  });

  it('tilts', () => {
    for (const [key, deg] of Object.entries(theme.tilt)) {
      expect(`${deg}deg`, key).toBe(resolve(`tilt-${kebab(key)}`));
    }
    expect(Object.keys(theme.tilt).length).toBe(names.filter((n) => n.startsWith('tilt-')).length);
  });
});
