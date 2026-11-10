// Inline SVG icons for the TV and the phone, in place of emoji (which render differently on every
// device). 24×24 line icons in `currentColor`, sized 1em so they follow the surrounding font. The
// reaction set (`EMOJI` in messages.ts) stays emoji: it's what players send, not UI.
const SVG = 'http://www.w3.org/2000/svg';

export type IconName = 'camera' | 'crown' | 'dots' | 'pencil' | 'phone' | 'speaker';

/** Path data per icon; `fill` icons are solid shapes, the rest are 2px strokes. */
const ICONS: Record<IconName, { d: string; fill?: boolean }> = {
  camera: {
    d: 'M3 8a2 2 0 0 1 2-2h2.5l2-3h5l2 3H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 9a4 4 0 1 0 0 8a4 4 0 1 0 0-8z',
  },
  crown: { d: 'M3 18 2 7l5.5 4.5L12 4l4.5 7.5L22 7l-1 11z', fill: true },
  dots: {
    d: 'M5 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4zM19 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z',
    fill: true,
  },
  pencil: { d: 'M4 20h4L19.5 8.5a2.1 2.1 0 0 0-4-4L4 16zM14 6l4 4' },
  phone: { d: 'M9 2h6a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2zM11 18h2' },
  speaker: { d: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13' },
};

/** A decorative icon (aria-hidden); give its button or container the accessible name. */
export function icon(name: IconName, cls = ''): SVGSVGElement {
  const spec = ICONS[name];
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', `ico ${cls}`.trim());
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', spec.d);
  if (spec.fill) {
    path.setAttribute('fill', 'currentColor');
  } else {
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
  }
  svg.append(path);
  return svg;
}
