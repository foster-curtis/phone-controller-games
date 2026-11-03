// Typed mirror of src/styles/brand.css for Phaser (the DOM uses the CSS custom properties directly),
// SPEC §2.3. brand.css is the source of truth; theme.test.ts fails if any value here drifts from it.
// Not mirrored: the `--clip-*` polygons (CSS only) and `--radius-round` (50% = draw a circle).
// Token names are fixed; new tokens are additive, derived from brand.css.
import type { PlayerColorId } from './ids';

export interface ColorToken {
  /** `#rrggbb` (CSS, Phaser text styles). */
  readonly hex: string;
  /** `0xRRGGBB` (Phaser fills, tints). */
  readonly num: number;
}

export interface TranslucentColorToken extends ColorToken {
  /** 0..1 */
  readonly alpha: number;
}

export interface PlayerColorToken {
  readonly fill: ColorToken;
  /** Text/icon color on top of `fill`. */
  readonly on: ColorToken;
}

export interface TypeStyle {
  /** px */
  readonly size: number;
  /** px (unitless CSS line-heights are multiplied out). */
  readonly lineHeight: number;
  /** A full font stack from `font`. */
  readonly family: string;
  readonly weight: 400 | 600 | 700;
  /** px (em values are multiplied by `size`). */
  readonly letterSpacing: number;
  readonly uppercase: boolean;
}

/** `0 0 <blur>px <color>` glows (`--glow-*`), drawn with `drop-shadow` in CSS, bloom on the TV. */
export interface GlowToken {
  /** px */
  readonly blur: number;
  readonly color: TranslucentColorToken;
}

/** `--font-*` stacks. The first family in each is the Google Fonts family from brand/head.html. */
export const font = {
  display: '"Chakra Petch", "Arial Narrow", ui-sans-serif, system-ui, sans-serif',
  sans: '"Geist", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

const glow = { hex: '#e8a33d', num: 0xe8a33d, alpha: 0.42 } as const;
const glowStrong = { hex: '#e8a33d', num: 0xe8a33d, alpha: 0.7 } as const;
const hostileGlow = { hex: '#8f6bff', num: 0x8f6bff, alpha: 0.42 } as const;

export const theme = {
  /** Every opaque `--<name>` color, camelCased. */
  color: {
    brandInk: { hex: '#14161a', num: 0x14161a },
    brandPaper: { hex: '#ffffff', num: 0xffffff },
    brandAmber: { hex: '#e8a33d', num: 0xe8a33d },
    brandGray: { hex: '#6b7280', num: 0x6b7280 },
    background: { hex: '#14161a', num: 0x14161a },
    foreground: { hex: '#ffffff', num: 0xffffff },
    surface: { hex: '#1a1d23', num: 0x1a1d23 },
    surfaceStrong: { hex: '#22262e', num: 0x22262e },
    border: { hex: '#2e333c', num: 0x2e333c },
    borderControl: { hex: '#6b7280', num: 0x6b7280 },
    muted: { hex: '#9aa1ad', num: 0x9aa1ad },
    presenceOff: { hex: '#5a6270', num: 0x5a6270 },
    stone: { hex: '#262b33', num: 0x262b33 },
    stoneEdge: { hex: '#3a404b', num: 0x3a404b },
    amber: { hex: '#e8a33d', num: 0xe8a33d },
    ember: { hex: '#ffd08a', num: 0xffd08a },
    hostile: { hex: '#8f6bff', num: 0x8f6bff },
    hostileCore: { hex: '#c7b4ff', num: 0xc7b4ff },
    accent: { hex: '#e8a33d', num: 0xe8a33d },
    accentOn: { hex: '#14161a', num: 0x14161a },
    accentText: { hex: '#e8a33d', num: 0xe8a33d },
    select: { hex: '#ffffff', num: 0xffffff },
    danger: { hex: '#e05252', num: 0xe05252 },
    dangerOn: { hex: '#14161a', num: 0x14161a },
    success: { hex: '#3fb98a', num: 0x3fb98a },
    successOn: { hex: '#14161a', num: 0x14161a },
  },
  /** `rgba()` colors in brand.css. */
  translucent: {
    scrim: { hex: '#0a0b0d', num: 0x0a0b0d, alpha: 0.72 },
    glow,
    glowStrong,
    hostileGlow,
  } satisfies Record<string, TranslucentColorToken>,
  /** `--player-<id>` / `--player-<id>-on`, in brand order. */
  players: {
    cobalt: { fill: { hex: '#2f63c4', num: 0x2f63c4 }, on: { hex: '#ffffff', num: 0xffffff } },
    jade: { fill: { hex: '#3fb98a', num: 0x3fb98a }, on: { hex: '#14161a', num: 0x14161a } },
    sky: { fill: { hex: '#7cc4f2', num: 0x7cc4f2 }, on: { hex: '#14161a', num: 0x14161a } },
    bone: { fill: { hex: '#e3e5e9', num: 0xe3e5e9 }, on: { hex: '#14161a', num: 0x14161a } },
    rose: { fill: { hex: '#f2a0b8', num: 0xf2a0b8 }, on: { hex: '#14161a', num: 0x14161a } },
    forest: { fill: { hex: '#2f7d4f', num: 0x2f7d4f }, on: { hex: '#ffffff', num: 0xffffff } },
  } satisfies Record<PlayerColorId, PlayerColorToken>,
  font,
  /** `--tracking-display` in em. */
  trackingDisplayEm: 0.04,
  /** The `.title` … `.code` classes. */
  type: {
    title: {
      size: 120,
      lineHeight: 108,
      family: font.display,
      weight: 700,
      letterSpacing: 4.8,
      uppercase: true,
    },
    banner: {
      size: 72,
      lineHeight: 72,
      family: font.display,
      weight: 700,
      letterSpacing: 2.88,
      uppercase: true,
    },
    h2: {
      size: 40,
      lineHeight: 44,
      family: font.display,
      weight: 700,
      letterSpacing: 1.6,
      uppercase: true,
    },
    score: {
      size: 48,
      lineHeight: 48,
      family: font.display,
      weight: 700,
      letterSpacing: 0,
      uppercase: false,
    },
    tag: {
      size: 22,
      lineHeight: 22,
      family: font.display,
      weight: 600,
      letterSpacing: 0.88,
      uppercase: true,
    },
    pad: {
      size: 28,
      lineHeight: 28,
      family: font.display,
      weight: 700,
      letterSpacing: 1.12,
      uppercase: true,
    },
    body: {
      size: 18,
      lineHeight: 26,
      family: font.sans,
      weight: 400,
      letterSpacing: 0,
      uppercase: false,
    },
    label: {
      size: 16,
      lineHeight: 20,
      family: font.sans,
      weight: 600,
      letterSpacing: 0,
      uppercase: false,
    },
    caption: {
      size: 14,
      lineHeight: 20,
      family: font.sans,
      weight: 400,
      letterSpacing: 0,
      uppercase: false,
    },
    codeTv: {
      size: 64,
      lineHeight: 64,
      family: font.mono,
      weight: 600,
      letterSpacing: 8,
      uppercase: false,
    },
    code: {
      size: 24,
      lineHeight: 24,
      family: font.mono,
      weight: 600,
      letterSpacing: 4,
      uppercase: false,
    },
  } satisfies Record<string, TypeStyle>,
  /** `--space-*` in px. */
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, tvSafe: 96 },
  /** `--radius` (`base`) and `--radius-*` in px. (`--radius-round: 50%` = draw a circle.) */
  radius: { base: 6, mark: 7, pill: 999 },
  /** `--chamfer` (`base`) and `--chamfer-sm`: the cut-corner size in px. */
  chamfer: { base: 10, sm: 6 },
  /** `--glow-*`. */
  glow: {
    sm: { blur: 6, color: glow },
    md: { blur: 14, color: glow },
    lg: { blur: 28, color: glowStrong },
    hostile: { blur: 14, color: hostileGlow },
  } satisfies Record<string, GlowToken>,
  /** `--stroke-*` in px. */
  stroke: { ring: 3, select: 3, tag: 4 },
  /** `--dur-*` and `--pulse-period` in ms; `--ease-*` as cubic-bezier control points. */
  motion: {
    durFast: 120,
    durBase: 200,
    pulsePeriod: 2400,
    easeOut: [0.2, 0.8, 0.2, 1] as readonly [number, number, number, number],
  },
} as const;

export type Theme = typeof theme;
export type TypeStyleName = keyof Theme['type'];
