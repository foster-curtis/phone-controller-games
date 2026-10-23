// Round results and match end: standings; the leader gets Next round / Rematch / Back to lobby.
import { el } from '../dom';
import type { Screen } from '../../shared/messages';
import { breakdownSection } from './breakdown';
import {
  heading,
  leaderButton,
  roundLine,
  standingsList,
  type ScreenCtx,
  type ScreenView,
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
    body.replaceChildren(roundLine(s), ...bd(s), stTitle(), standingsList(s));
    actions.replaceChildren(...(s.isLeader ? [leaderButton(ctx, 'Next round', 'next')] : []));
  };
  apply(first);
  return { el: root, update: apply, destroy() {} };
}

export function createMatchEnd(ctx: ScreenCtx, first: MatchEnd): ScreenView<MatchEnd> {
  const root = el('section', { class: 'screen matchEnd', 'data-screen': 'matchEnd' });
  const head = el('div', { class: 'res-head' });
  const body = el('div', { class: 'res-body scroll-y' });
  const actions = el('div', { class: 'actions' });
  root.append(head, body, actions);
  const apply = (s: MatchEnd) => {
    const winner = s.standings.find((x) => x.playerId === s.winnerId);
    head.replaceChildren(
      el('h1', { class: 'banner sticker-heading', text: 'Match over' }),
      el('p', { class: 'h2', text: winner ? `${winner.name} wins!` : 'We have a winner!' }),
    );
    body.replaceChildren(...bd(s), stTitle(), standingsList(s));
    actions.replaceChildren(
      ...(s.isLeader
        ? [leaderButton(ctx, 'Rematch', 'rematch'), leaderButton(ctx, 'Back to lobby', 'lobby', '')]
        : []),
    );
  };
  apply(first);
  return { el: root, update: apply, destroy() {} };
}
