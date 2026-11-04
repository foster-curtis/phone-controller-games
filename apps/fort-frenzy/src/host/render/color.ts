// Color math for render readability checks (C3 floor contrast, BUILD_PLAN §8 FF3-fix-2): WCAG relative
// luminance and contrast ratio, sRGB-space alpha blending (what Phaser's blend does) and the ADD tint
// the map frames take (`ThemeHost.map.floorLift`). Pure: no Phaser.

/** 0–255 per channel. */
export type Rgb = readonly [r: number, g: number, b: number];

/** `#rrggbb` or `0xRRGGBB`. */
export function rgb(c: string | number): Rgb {
  const n = typeof c === 'number' ? c : parseInt(c.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function toHex(c: Rgb): string {
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

const lin = (v: number) => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function luminance(c: Rgb): number {
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** WCAG contrast ratio, 1 to 21, either order. */
export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `top` at `alpha` over an opaque `under`, blended in sRGB like the WebGL canvas. */
export function over(top: Rgb, alpha: number, under: Rgb): Rgb {
  return [0, 1, 2].map((i) => top[i]! * alpha + under[i]! * (1 - alpha)) as unknown as Rgb;
}

/** Phaser's ADD tint: the tint is added per channel, clamped. */
export function lift(c: Rgb, add: string | number): Rgb {
  const a = rgb(add);
  return [0, 1, 2].map((i) => Math.min(255, c[i]! + a[i]!)) as unknown as Rgb;
}
