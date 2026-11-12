// Round results and match end: standings; the leader gets Next round / Rematch / Back to lobby. Match
// end also has Give feedback for everyone (PLATFORM decision #11).
import { feedbackUrl } from '@pcg/catalog';
import { el } from '@pcg/controller-kit';
import { GAME_ID, type Screen } from '../../shared/messages';
import { breakdownSection } from './breakdown';
import {
  heading,
  leaderButton,
  roundLine,
  standingsList,
  type ScreenCtx,
  type ScreenView,
  waitingLine,
} from './common';

type Results = Extract<Screen, { kind: 'results' }>;
type MatchEnd = Extract<Screen, { kind: 'matchEnd' }>;

const bd = (s: Results | MatchEnd): HTMLElement[] => {
  const sec = breakdownSection(s.breakdown, s.name);
  return sec ? [sec] : [];
};
const stTitle = (): HTMLElement => el('h2', { class: 'label bd-title', text: 'Standings' });

export function createResults(ctx: ScreenCtx, first: Results): ScreenView<Results> {
  const root = el('section', { class: 'screen results', 'data-screen': 'results' });
  const head = el('div', { class: 'res-head' });
  const body = el('div', { class: 'res-body scroll-y' });
  const actions = el('div', { class: 'actions' });
  root.append(head, body, actions);
  const apply = (s: Results) => {
    const survivor = s.standings.find((x) => x.playerId === s.survivorId);
    head.replaceChildren(
      heading(`Round ${s.round}`),
      el('p', {
        class: 'banner-line label',
        text: survivor ? `${survivor.name} survived!` : 'Nobody survived',
      }),
    );
    body.replaceChildren(
      roundLine(s),
      ...bd(s),
      stTitle(),
      standingsList(s, ctx),
      ...waitingLine(s),
    );
    actions.replaceChildren(...(s.isLeader ? [leaderButton(ctx, 'Next round', 'next')] : []));
  };
  apply(first);
  return { el: root, update: apply, destroy() {} };
}

/**
 * The feedback form in a new tab. A plain link, so this page never navigates away; `noopener` cuts the
 * form's tab off from this one. The socket stays up, and net-client reconnects at once if the phone
 * dropped it while the player was in the other tab.
 */
export function feedbackLink(): HTMLAnchorElement {
  return el('a', {
    class: 'btn label btn-link',
    href: feedbackUrl(GAME_ID),
    target: '_blank',
    rel: 'noopener',
    'data-feedback': '',
    text: 'Give feedback',
  });
}

export function createMatchEnd(ctx: ScreenCtx, first: MatchEnd): ScreenView<MatchEnd> {
  const root = el('section', { class: 'screen matchEnd', 'data-screen': 'matchEnd' });
  const head = el('div', { class: 'res-head' });
  const body = el('div', { class: 'res-body scroll-y' });
  const actions = el('div', { class: 'actions' });
  root.append(head, body, actions);
  // Built once: re-rendering the actions must never swap it out from under a tap.
  const feedback = feedbackLink();
  const apply = (s: MatchEnd) => {
    const winner = s.standings.find((x) => x.playerId === s.winnerId);
    head.replaceChildren(
      el('h1', { class: 'banner sticker-heading', text: 'Match over' }),
      el('p', { class: 'h2', text: winner ? `${winner.name} wins!` : 'We have a winner!' }),
    );
    body.replaceChildren(...bd(s), stTitle(), standingsList(s, ctx), ...waitingLine(s));
    actions.replaceChildren(
      ...(s.isLeader
        ? [leaderButton(ctx, 'Rematch', 'rematch'), leaderButton(ctx, 'Back to lobby', 'lobby', '')]
        : []),
      feedback,
    );
  };
  apply(first);
  return { el: root, update: apply, destroy() {} };
}
