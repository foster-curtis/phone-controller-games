// Parity test (SPEC §2.3): every value mirrored in theme.ts must equal its custom property / class in
// brand.css, and every brand.css token must be mirrored (or be on the short not-mirrored list).
import { describe, expect, it } from 'vitest';
import brandCss from '../../styles/brand.css?raw';
import { PLAYER_COLOR_IDS } from '../ids';
import { theme } from '../theme';

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
const rgba = (v: string) => {
  const m = /^rgba\((\d+), ?(\d+), ?(\d+), ?([\d.]+)\)$/.exec(v);
  if (!m) throw new Error(`not rgba(): ${v}`);
  const [r, g, b, a] = m.slice(1).map(Number) as [number, number, number, number];
  const num = (r << 16) | (g << 8) | b;
  return { num, hex: `#${num.toString(16).padStart(6, '0')}`, alpha: a };
};

function expectColor(name: string, token: { hex: string; num: number }) {
  const value = resolve(name).toLowerCase();
  expect(isHex(value), `--${name} = ${value}`).toBe(true);
  expect(token.hex, `--${name}`).toBe(value);
  expect(token.num, `--${name} (num)`).toBe(parseInt(value.slice(1), 16));
}

const names = [...vars.keys()];
const isPlayerVar = (n: string) => n.startsWith('player-');
/** Tokens with no Phaser use; mirrored nowhere on purpose. */
const NOT_MIRRORED = (n: string) => n.startsWith('clip-') || n === 'radius-round';

describe('theme.ts mirrors brand.css', () => {
  it('parses brand.css', () => {
    expect(vars.size).toBeGreaterThan(60);
  });

  it('semantic colors', () => {
    for (const [key, token] of Object.entries(theme.color)) expectColor(kebab(key), token);
    const opaque = names.filter((n) => !isPlayerVar(n) && isHex(resolve(n)));
    expect(Object.keys(theme.color).map(kebab).sort()).toEqual(opaque.sort());
  });

  it('translucent colors', () => {
    for (const [key, token] of Object.entries(theme.translucent)) {
      expect(token, key).toEqual(rgba(resolve(kebab(key))));
    }
    const all = names.filter((n) => resolve(n).startsWith('rgba('));
    expect(Object.keys(theme.translucent).map(kebab).sort()).toEqual(all.sort());
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

  it('font stacks and display tracking', () => {
    for (const [key, stack] of Object.entries(theme.font))
      expect(stack, key).toBe(resolve(`font-${key}`));
    expect(Object.keys(theme.font).sort()).toEqual(
      names
        .filter((n) => n.startsWith('font-'))
        .map((n) => n.slice(5))
        .sort(),
    );
    expect(`${theme.trackingDisplayEm}em`).toBe(resolve('tracking-display'));
  });

  it('type scale', () => {
    const classes = new Map<string, string>();
    for (const m of css.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
      if (/\bfont:/.test(m[2]!)) classes.set(m[1]!, m[2]!);
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
      const raw = /letter-spacing:\s*([^;]+);/.exec(body)?.[1]?.trim();
      const ls = raw?.replace(/var\(--([\w-]+)\)/g, (_, ref: string) => resolve(ref));
      const spacing = !ls ? 0 : ls.endsWith('em') ? parseFloat(ls) * Number(size) : px(ls);
      expect(style.letterSpacing, `${key} letter-spacing`).toBeCloseTo(spacing, 6);
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

  it('radii and chamfers', () => {
    const radiusName = (key: string) => (key === 'base' ? 'radius' : `radius-${kebab(key)}`);
    for (const [key, value] of Object.entries(theme.radius))
      expect(value, key).toBe(px(resolve(radiusName(key))));
    expect(resolve('radius-round')).toBe('50%');
    expect(Object.keys(theme.radius).map(radiusName).sort()).toEqual(
      names.filter((n) => /^radius(-|$)/.test(n) && !NOT_MIRRORED(n)).sort(),
    );
    const chamferName = (key: string) => (key === 'base' ? 'chamfer' : `chamfer-${kebab(key)}`);
    for (const [key, value] of Object.entries(theme.chamfer))
      expect(value, key).toBe(px(resolve(chamferName(key))));
    expect(Object.keys(theme.chamfer).map(chamferName).sort()).toEqual(
      names.filter((n) => /^chamfer(-|$)/.test(n)).sort(),
    );
  });

  it('glows', () => {
    for (const [key, token] of Object.entries(theme.glow)) {
      const m = /^0 0 ([\d.]+)px (rgba\(.+\))$/.exec(resolve(`glow-${kebab(key)}`));
      expect(m, `--glow-${key}`).not.toBeNull();
      expect(token.blur, key).toBe(Number(m![1]));
      expect(token.color, key).toEqual(rgba(m![2]!));
    }
    // --glow and --glow-strong are colors (translucent); the rest are glow shadows.
    const shadows = names.filter((n) => n.startsWith('glow-') && !resolve(n).startsWith('rgba('));
    expect(
      Object.keys(theme.glow)
        .map((k) => `glow-${kebab(k)}`)
        .sort(),
    ).toEqual(shadows.sort());
  });

  it('strokes', () => {
    for (const [key, value] of Object.entries(theme.stroke))
      expect(value, key).toBe(px(resolve(`stroke-${key}`)));
    expect(Object.keys(theme.stroke).length).toBe(
      names.filter((n) => n.startsWith('stroke-')).length,
    );
  });

  it('motion', () => {
    const ms = (v: string) => {
      const m = /^([\d.]+)(ms|s)$/.exec(v);
      if (!m) throw new Error(`not a duration: ${v}`);
      return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
    };
    expect(theme.motion.durFast).toBe(ms(resolve('dur-fast')));
    expect(theme.motion.durBase).toBe(ms(resolve('dur-base')));
    expect(theme.motion.pulsePeriod).toBe(ms(resolve('pulse-period')));
    expect(`cubic-bezier(${theme.motion.easeOut.join(', ')})`).toBe(resolve('ease-out'));
    expect(names.filter((n) => /^(dur|ease|pulse)-/.test(n)).length).toBe(4);
  });

  it('every token is mirrored or listed as not mirrored', () => {
    const covered = (n: string) =>
      isPlayerVar(n) ||
      isHex(resolve(n)) ||
      resolve(n).startsWith('rgba(') ||
      /^(font|space|radius|chamfer|glow|stroke|dur|ease|pulse)(-|$)/.test(n) ||
      n === 'tracking-display' ||
      n === 'color-scheme' ||
      NOT_MIRRORED(n);
    expect(names.filter((n) => !covered(n))).toEqual([]);
  });
});
