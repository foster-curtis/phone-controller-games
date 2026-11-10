// Rules-card illustrations (SPEC §6.2.1, §6.6): one small inline SVG per card, drawn with classes
// that tv.css maps to brand tokens (no color literals here). Decorative: aria-hidden.
const CAMERA = `
  <g class="a-flash">
    <path d="M160 40 L150 6 M160 40 L184 14 M160 40 L206 34 M160 40 L136 12 M160 40 L114 34" class="a-ray"/>
  </g>
  <rect x="70" y="52" width="180" height="116" rx="16" class="a-body"/>
  <rect x="70" y="52" width="180" height="26" rx="12" class="a-amber"/>
  <circle cx="160" cy="112" r="40" class="a-ink"/>
  <circle cx="160" cy="112" r="28" class="a-lens"/>
  <circle cx="150" cy="102" r="7" class="a-white"/>
  <rect x="214" y="30" width="26" height="16" rx="3" class="a-pink"/>`;

const MOVING = `
  <path d="M30 160 L190 90 L190 190 Z" class="a-beam"/>
  <circle cx="30" cy="160" r="14" class="a-ink"/><circle cx="30" cy="160" r="8" class="a-amber"/>
  <circle cx="220" cy="70" r="20" class="a-p1"/>
  <circle cx="270" cy="120" r="20" class="a-p2"/>
  <circle cx="235" cy="170" r="20" class="a-p3"/>
  <path d="M220 36 Q250 30 262 56 M262 56 l-4 -14 M262 56 l-14 -2" class="a-arrow"/>
  <path d="M296 150 Q292 182 262 188 M262 188 l12 -10 M262 188 l12 4" class="a-arrow"/>`;

const HOUSE = `
  <rect x="24" y="24" width="272" height="152" rx="10" class="a-room"/>
  <rect x="48" y="52" width="104" height="44" rx="10" class="a-couch"/>
  <rect x="58" y="42" width="84" height="20" rx="8" class="a-couch"/>
  <circle cx="100" cy="76" r="46" class="a-no"/>
  <path d="M68 108 L132 44" class="a-no"/>
  <circle cx="226" cy="84" r="18" class="a-p1"/>
  <circle cx="262" cy="130" r="18" class="a-p2"/>
  <circle cx="196" cy="136" r="18" class="a-p3"/>
  <path d="M214 150 l10 10 l22 -26" class="a-check"/>`;

const BUSTED = `
  <rect x="40" y="14" width="170" height="172" rx="6" class="a-pink"/>
  <rect x="32" y="6" width="170" height="172" rx="6" class="a-print"/>
  <rect x="44" y="18" width="146" height="112" class="a-ink"/>
  <circle cx="86" cy="76" r="22" class="a-ring a-r1"/>
  <circle cx="146" cy="60" r="22" class="a-ring a-r2"/>
  <path d="M224 80 l30 -14 M254 66 l-4 14 M254 66 l-14 -4" class="a-arrow"/>
  <text x="244" y="116" class="a-text a-plus">+1</text>
  <text x="244" y="170" class="a-text a-minus">−1</text>`;

const WINNER = `
  <rect x="40" y="120" width="70" height="60" class="a-step"/>
  <rect x="125" y="86" width="70" height="94" class="a-step a-first"/>
  <rect x="210" y="140" width="70" height="40" class="a-step"/>
  <path d="M142 46 l8 -20 l10 14 l10 -14 l8 20 z" class="a-amber"/>
  <rect x="142" y="44" width="36" height="8" class="a-amber"/>
  <circle cx="160" cy="68" r="14" class="a-p1"/>
  <circle cx="75" cy="100" r="12" class="a-p2"/>
  <circle cx="245" cy="120" r="12" class="a-p3"/>
  <text x="160" y="162" class="a-text a-num">1</text>`;

const ART = [CAMERA, MOVING, HOUSE, BUSTED, WINNER];

/** The illustration for rules card `i` (clamped), as a `<div class="rule-art">` holding an SVG. */
export function ruleArt(i: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'rule-art';
  el.setAttribute('aria-hidden', 'true');
  const body = ART[Math.min(Math.max(i, 0), ART.length - 1)]!;
  el.innerHTML = `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" focusable="false">${body}</svg>`;
  return el;
}
