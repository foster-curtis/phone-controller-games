// Podium screen (SPEC §6.15): forum backdrop, travertine blocks marked II, I, III (art/forum/ui/podium.svg),
// 4th place and below in a row with totals shown at once, 3rd then 2nd then 1st revealed by `step`
// (empty blocks show a dim "?"), the "[NAME] WINS!" banner on 1st, ties sharing the block and banner,
// and the feedback QR (PLATFORM decision #11). Totals appear here for the first time. Crown and
// fireworks are TF18's.
import podiumUrl from '../../../art/forum/ui/podium.svg?url';
import { h, qrSvg } from './dom';
import type { TvPodiumRow } from './types';

/** Steps: 0 = only the 4th+ row, 1 = 3rd, 2 = 2nd, 3 = 1st and the banner. */
export const PODIUM_STEPS = 3;

/** Podium blocks in view order (left to right) with their place: II, I, III. */
const BLOCKS = [
  { place: 2, label: 'II', revealAt: 2 },
  { place: 1, label: 'I', revealAt: 3 },
  { place: 3, label: 'III', revealAt: 1 },
] as const;

/** Banner text: ties share it ("A & B WIN!"). */
export function winnersBanner(rows: readonly TvPodiumRow[]): string {
  const names = rows.filter((r) => r.place === 1).map((r) => r.name);
  if (names.length === 0) return '';
  return `${names.join(' & ')} ${names.length === 1 ? 'WINS!' : 'WIN!'}`;
}

export interface Podium {
  readonly el: HTMLElement;
  update(rows: readonly TvPodiumRow[], feedbackUrl: string, step: number): void;
}

function totalStrip(total: number, gold: boolean): HTMLElement {
  const s = h('div', `podium-total coin-edge${gold ? ' is-gold' : ''}`);
  s.dataset.role = 'total';
  s.append(h('span', 'money', String(Math.round(total))));
  return s;
}

function standing(row: TvPodiumRow): HTMLElement {
  const li = h('li', 'podium-who');
  li.dataset.role = 'podium-player';
  li.dataset.color = row.color;
  li.append(h('span', 'podium-name name-tv', row.name), totalStrip(row.total, row.place === 1));
  return li;
}

export function createPodium(): Podium {
  const el = h('section', 'podium');
  const art = h('div', 'podium-art');
  const img = h('img', 'podium-img');
  img.src = podiumUrl;
  img.alt = '';
  const slots = BLOCKS.map((b) => {
    const col = h('ul', 'podium-slot');
    col.dataset.place = String(b.place);
    return col;
  });
  art.append(img, ...slots);

  const banner = h('h2', 'banner podium-banner');
  banner.dataset.role = 'winner-banner';
  const rest = h('ul', 'podium-rest');
  rest.dataset.role = 'podium-rest';
  const fb = h('aside', 'podium-feedback');
  const fbQr = h('div', 'podium-feedback-qr');
  fb.append(h('p', 'label', 'Give feedback'), fbQr);
  el.append(banner, art, rest, fb);

  let shownUrl = '';
  return {
    el,
    update(rows, feedbackUrl, step) {
      el.dataset.step = String(step);
      BLOCKS.forEach((b, i) => {
        const slot = slots[i]!;
        const here = rows.filter((r) => r.place === b.place);
        const revealed = step >= b.revealAt;
        slot.dataset.revealed = String(revealed);
        if (!revealed) {
          const q = h('li', 'podium-q', '?');
          q.dataset.role = 'podium-unknown';
          slot.replaceChildren(q);
        } else {
          slot.replaceChildren(...here.map(standing));
        }
      });
      rest.replaceChildren(...rows.filter((r) => r.place >= 4).map(standing));
      const done = step >= PODIUM_STEPS;
      banner.textContent = done ? winnersBanner(rows) : '';
      banner.hidden = !done;
      if (feedbackUrl !== shownUrl) {
        shownUrl = feedbackUrl;
        fbQr.replaceChildren(qrSvg(feedbackUrl, 'Feedback form QR code'));
      }
    },
  };
}
