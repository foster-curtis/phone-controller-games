// Typed mirror of src/styles/brand.css for Phaser (the DOM uses the CSS custom properties directly).
// brand.css is the source of truth; theme.test.ts fails if any value here drifts from it.
// Frozen at F0: token names are fixed; new tokens are additive (`contract+`), derived from brand.css.
import type { PlayerColorId } from './messages';

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
  readonly weight: 400 | 600;
  /** px */
  readonly letterSpacing: number;
}

export interface ShadowToken {
  /** px */
  readonly x: number;
  /** px */
  readonly y: number;
  /** px */
  readonly blur: number;
  readonly color: ColorToken;
}

/** `--font-*` stacks. The first family in each is the Google Fonts family from brand/head.html. */
export const font = {
  display: '"Lilita One", "Arial Rounded MT Bold", ui-rounded, system-ui, sans-serif',
  sans: '"Geist", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/**
 * contract+ (M7): system emoji font stack for Phaser text (spectator emoji). Not a brand.css token
 * (emoji glyphs come from the OS), so it lives outside `font`, which mirrors the `--font-*` vars.
 */
export const emojiFont =
  '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif';

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
    pan: { hex: '#26211d', num: 0x26211d },
    panRim: { hex: '#3d3530', num: 0x3d3530 },
    heat: { hex: '#ef5a2a', num: 0xef5a2a },
    heatOn: { hex: '#14161a', num: 0x14161a },
    eggWhite: { hex: '#ffffff', num: 0xffffff },
    eggOutline: { hex: '#14161a', num: 0x14161a },
    yolk: { hex: '#e8a33d', num: 0xe8a33d },
    yolkShine: { hex: '#ffffff', num: 0xffffff },
    cream: { hex: '#fff6e6', num: 0xfff6e6 },
    creamOn: { hex: '#14161a', num: 0x14161a },
    stickerOutline: { hex: '#14161a', num: 0x14161a },
    stickerEdge: { hex: '#ffffff', num: 0xffffff },
    accent: { hex: '#e8a33d', num: 0xe8a33d },
    accentOn: { hex: '#14161a', num: 0x14161a },
    accentText: { hex: '#e8a33d', num: 0xe8a33d },
    select: { hex: '#ffffff', num: 0xffffff },
    danger: { hex: '#e05252', num: 0xe05252 },
    dangerOn: { hex: '#14161a', num: 0x14161a },
    success: { hex: '#3fb98a', num: 0x3fb98a },
    presenceOff: { hex: '#5a6270', num: 0x5a6270 },
  },
  /** `rgba()` colors in brand.css. */
  translucent: {
    steam: { hex: '#ffffff', num: 0xffffff, alpha: 0.55 },
    scrim: { hex: '#0a0b0d', num: 0x0a0b0d, alpha: 0.72 },
  },
  /** `--player-<id>` / `--player-<id>-on`, in brand order. */
  players: {
    crimson: { fill: { hex: '#c23b3b', num: 0xc23b3b }, on: { hex: '#ffffff', num: 0xffffff } },
    cobalt: { fill: { hex: '#2f63c4', num: 0x2f63c4 }, on: { hex: '#ffffff', num: 0xffffff } },
    jade: { fill: { hex: '#3fb98a', num: 0x3fb98a }, on: { hex: '#14161a', num: 0x14161a } },
    berry: { fill: { hex: '#a8327f', num: 0xa8327f }, on: { hex: '#ffffff', num: 0xffffff } },
    bone: { fill: { hex: '#e3e5e9', num: 0xe3e5e9 }, on: { hex: '#14161a', num: 0x14161a } },
    sky: { fill: { hex: '#7cc4f2', num: 0x7cc4f2 }, on: { hex: '#14161a', num: 0x14161a } },
    rose: { fill: { hex: '#f2a0b8', num: 0xf2a0b8 }, on: { hex: '#14161a', num: 0x14161a } },
    forest: { fill: { hex: '#2f7d4f', num: 0x2f7d4f }, on: { hex: '#ffffff', num: 0xffffff } },
  } satisfies Record<PlayerColorId, PlayerColorToken>,
  font,
  emojiFont,
  /** The `.title` … `.code` classes. */
  type: {
    title: { size: 120, lineHeight: 108, family: font.display, weight: 400, letterSpacing: 0 },
    banner: { size: 72, lineHeight: 72, family: font.display, weight: 400, letterSpacing: 0 },
    h2: { size: 40, lineHeight: 44, family: font.display, weight: 400, letterSpacing: 0 },
    score: { size: 48, lineHeight: 48, family: font.display, weight: 400, letterSpacing: 0 },
    tag: { size: 22, lineHeight: 22, family: font.display, weight: 400, letterSpacing: 0 },
    pad: { size: 28, lineHeight: 28, family: font.display, weight: 400, letterSpacing: 0 },
    body: { size: 18, lineHeight: 26, family: font.sans, weight: 400, letterSpacing: 0 },
    label: { size: 16, lineHeight: 20, family: font.sans, weight: 600, letterSpacing: 0 },
    caption: { size: 14, lineHeight: 20, family: font.sans, weight: 400, letterSpacing: 0 },
    codeTv: { size: 64, lineHeight: 64, family: font.mono, weight: 600, letterSpacing: 8 },
    code: { size: 24, lineHeight: 24, family: font.mono, weight: 600, letterSpacing: 4 },
  } satisfies Record<string, TypeStyle>,
  /** `--space-*` in px. */
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, tvSafe: 96 },
  /** `--radius` (`base`) and `--radius-*` in px. (`--radius-round: 50%` = draw a circle.) */
  radius: { base: 6, sticker: 14, pill: 999, mark: 7 },
  /** `--stroke-*` in px. */
  stroke: { sticker: 3, select: 3 },
  /** `--shadow-*` (hard offset shadows). */
  shadow: {
    sticker: { x: 4, y: 4, blur: 0, color: { hex: '#000000', num: 0x000000 } },
    stickerSm: { x: 2, y: 2, blur: 0, color: { hex: '#000000', num: 0x000000 } },
    pressed: { x: 0, y: 0, blur: 0, color: { hex: '#000000', num: 0x000000 } },
  } satisfies Record<string, ShadowToken>,
  /** `--tilt-*` in degrees. */
  tilt: { title: -3, sticker: -2 },
} as const;

export type Theme = typeof theme;
export type TypeStyleName = keyof Theme['type'];
