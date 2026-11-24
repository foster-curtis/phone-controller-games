// Typed mirror of src/styles/brand.css for Phaser (the DOM uses the CSS custom properties directly),
// SPEC §5, §6.0. brand.css is the source of truth (read-only brand kit); __tests__/theme.test.ts fails
// if any value here drifts from it. Token names are fixed; new tokens are additive, derived from brand.css.

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
  readonly weight: 400 | 600 | 900;
  /** px */
  readonly letterSpacing: number;
  readonly uppercase: boolean;
}

/** The brand kit's 8 player colors, in brand order (`--player-<id>` in brand.css). */
export const PLAYER_COLOR_IDS = [
  'crimson',
  'cobalt',
  'jade',
  'berry',
  'bone',
  'sky',
  'rose',
  'forest',
] as const;
export type PlayerColorId = (typeof PLAYER_COLOR_IDS)[number];

/** `--font-*` stacks. The first family in each is the Google Fonts family from brand/head.html. */
export const font = {
  display: '"Cinzel", "Trajan Pro", Georgia, serif',
  sans: '"Geist", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

export const theme = {
  /** Every opaque `--<name>` color but fabrics, canopies and players, camelCased (aliases resolved). */
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
    gold: { hex: '#e8a33d', num: 0xe8a33d },
    goldOn: { hex: '#14161a', num: 0x14161a },
    bronze: { hex: '#a8703a', num: 0xa8703a },
    bronzeLight: { hex: '#c48a4c', num: 0xc48a4c },
    travertine: { hex: '#e9dfc9', num: 0xe9dfc9 },
    travertineLight: { hex: '#f3ecdd', num: 0xf3ecdd },
    linenBleached: { hex: '#efe6d2', num: 0xefe6d2 },
    forumGround: { hex: '#b9a888', num: 0xb9a888 },
    paverLine: { hex: '#a3926f', num: 0xa3926f },
    woodLight: { hex: '#c9a27a', num: 0xc9a27a },
    wood: { hex: '#8a6648', num: 0x8a6648 },
    woodDark: { hex: '#5a3f2c', num: 0x5a3f2c },
    woodPost: { hex: '#7a5a43', num: 0x7a5a43 },
    shelfBack: { hex: '#3e2b1f', num: 0x3e2b1f },
    shelfTop: { hex: '#a07a55', num: 0xa07a55 },
    shelfEdge: { hex: '#6b4a33', num: 0x6b4a33 },
    coneIdle: { hex: '#e9dfc9', num: 0xe9dfc9 },
    coneAlert: { hex: '#e05252', num: 0xe05252 },
    accent: { hex: '#e8a33d', num: 0xe8a33d },
    accentOn: { hex: '#14161a', num: 0x14161a },
    accentText: { hex: '#e8a33d', num: 0xe8a33d },
    select: { hex: '#ffffff', num: 0xffffff },
    danger: { hex: '#e05252', num: 0xe05252 },
    dangerOn: { hex: '#14161a', num: 0x14161a },
    success: { hex: '#3fb98a', num: 0x3fb98a },
    presenceOff: { hex: '#5a6270', num: 0x5a6270 },
  },
  /** `rgba()` tokens. */
  translucent: {
    scrim: { hex: '#0a0b0d', num: 0x0a0b0d, alpha: 0.72 },
    revealDim: { hex: '#0a0b0d', num: 0x0a0b0d, alpha: 0.55 },
    closedStallShade: { hex: '#0a0b0d', num: 0x0a0b0d, alpha: 0.42 },
  },
  /** Outfit fabrics (`--fabric-*`), shared by players and NPCs (SPEC §6.0, §6.11). */
  fabric: {
    linen: { hex: '#d9cfb8', num: 0xd9cfb8 },
    umber: { hex: '#7a5a43', num: 0x7a5a43 },
    terracotta: { hex: '#a85f45', num: 0xa85f45 },
    madder: { hex: '#9c5a63', num: 0x9c5a63 },
    olive: { hex: '#7d7f4f', num: 0x7d7f4f },
    sage: { hex: '#8a9a7e', num: 0x8a9a7e },
    woad: { hex: '#5b7186', num: 0x5b7186 },
    mulberry: { hex: '#6e5a72', num: 0x6e5a72 },
  },
  /** One canopy color per shop (`--canopy-*`, SPEC §6.3). */
  canopy: {
    pawnbroker: { hex: '#3a404b', num: 0x3a404b },
    bakery: { hex: '#d9cfb8', num: 0xd9cfb8 },
    pottery: { hex: '#a85f45', num: 0xa85f45 },
    clothing: { hex: '#5b7186', num: 0x5b7186 },
    wine: { hex: '#9c5a63', num: 0x9c5a63 },
    smithy: { hex: '#7a5a43', num: 0x7a5a43 },
    perfume: { hex: '#8a9a7e', num: 0x8a9a7e },
    spices: { hex: '#a8703a', num: 0xa8703a },
    rugs: { hex: '#7d7f4f', num: 0x7d7f4f },
    jewelry: { hex: '#6e5a72', num: 0x6e5a72 },
  },
  /** Player colors (`--player-<id>` / `-on`): phone banner and end-of-round reveal only (SPEC §6.0). */
  players: {
    crimson: { fill: { hex: '#c23b3b', num: 0xc23b3b }, on: { hex: '#ffffff', num: 0xffffff } },
    cobalt: { fill: { hex: '#2f63c4', num: 0x2f63c4 }, on: { hex: '#ffffff', num: 0xffffff } },
    jade: { fill: { hex: '#3fb98a', num: 0x3fb98a }, on: { hex: '#14161a', num: 0x14161a } },
    berry: { fill: { hex: '#a8327f', num: 0xa8327f }, on: { hex: '#ffffff', num: 0xffffff } },
    bone: { fill: { hex: '#e3e5e9', num: 0xe3e5e9 }, on: { hex: '#14161a', num: 0x14161a } },
    sky: { fill: { hex: '#7cc4f2', num: 0x7cc4f2 }, on: { hex: '#14161a', num: 0x14161a } },
    rose: { fill: { hex: '#f2a0b8', num: 0xf2a0b8 }, on: { hex: '#14161a', num: 0x14161a } },
    forest: { fill: { hex: '#2f7d4f', num: 0x2f7d4f }, on: { hex: '#ffffff', num: 0xffffff } },
  },
  font,
  /** Type scale (the `.<name>` classes in brand.css). */
  type: {
    title: {
      size: 96,
      lineHeight: 96,
      family: font.display,
      weight: 900,
      letterSpacing: 4,
      uppercase: true,
    },
    banner: {
      size: 56,
      lineHeight: 56,
      family: font.display,
      weight: 900,
      letterSpacing: 3,
      uppercase: true,
    },
    h2: {
      size: 32,
      lineHeight: 35.2,
      family: font.display,
      weight: 900,
      letterSpacing: 2,
      uppercase: true,
    },
    namePhone: {
      size: 15,
      lineHeight: 15,
      family: font.display,
      weight: 900,
      letterSpacing: 1,
      uppercase: true,
    },
    button: {
      size: 14,
      lineHeight: 14,
      family: font.display,
      weight: 900,
      letterSpacing: 1,
      uppercase: true,
    },
    nameTv: {
      size: 22,
      lineHeight: 22,
      family: font.sans,
      weight: 600,
      letterSpacing: 0,
      uppercase: false,
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
    money: {
      size: 18,
      lineHeight: 18,
      family: font.mono,
      weight: 600,
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
  },
  /** px (`--space-*`). */
  space: {
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    6: 24,
    8: 32,
    12: 48,
    tvSafe: 96,
  },
  /** px (`--radius`, `--radius-*`). */
  radius: {
    base: 6,
    card: 10,
    panel: 14,
    pill: 999,
    mark: 14,
  },
  /** The stamped coin edge (`--coin-edge`, `--coin-edge-offset`): primary action and money only. */
  coinEdge: { width: 1.5, color: { hex: '#14161a', num: 0x14161a }, offset: -5 },
} as const satisfies {
  color: Record<string, ColorToken>;
  translucent: Record<string, TranslucentColorToken>;
  fabric: Record<string, ColorToken>;
  canopy: Record<string, ColorToken>;
  players: Record<PlayerColorId, PlayerColorToken>;
  font: typeof font;
  type: Record<string, TypeStyle>;
  space: Record<string, number>;
  radius: Record<string, number>;
  coinEdge: { width: number; color: ColorToken; offset: number };
};
