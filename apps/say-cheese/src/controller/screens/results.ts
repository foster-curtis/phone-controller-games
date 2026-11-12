// Results and match end (SPEC §6.7): this phone's round score plus standings; the leader sees their
// buttons (SPEC §6.5). Match end also has Give feedback for everyone (PLATFORM decision #11).
import { feedbackUrl } from '@pcg/catalog';
import { el } from '@pcg/controller-kit';
import { GAME_ID, type Screen, type Standing } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { emojiBar } from './emojiBar';
import { button, chip, heading, para, renderedView, type View } from './view';

function standingsList(rows: readonly Standing[], winners: readonly string[] = []): HTMLElement {
  return el(
    'ol',
    { class: 'standings' },
    ...rows.map((r) =>
      el(
        'li',
        { class: r.left || !r.connected ? 'away' : '' },
        // An empty crown cell on the other rows keeps every chip in one column
        winners.length > 0
          ? el('span', { class: 'crown', text: winners.includes(r.playerId) ? '★' : '' })
          : null,
        chip(r.name, r.color),
        el('span', { class: 'score-num', text: String(r.score) }),
      ),
    ),
  );
}

export function resultsView(first: Screen, ctx: Ctx): View {
  return renderedView('results', first, (s) => {
    const mine = s.seats[0];
    let line: string;
    if (s.role === 'photographer') {
      line = s.photographerDelta === 0 ? 'No catches. No change.' : `You: ${s.photographerDelta}`;
    } else {
      const c = s.caught.find((x) => mine && x.name === mine.name && x.color === mine.color);
      line = c && c.count > 0 ? `Caught ${c.count}×` : 'Not caught!';
    }
    return [
      heading('Round results'),
      el('p', { class: 'pill', text: line }),
      standingsList(s.standings),
      s.isLeader
        ? button(
            s.last ? 'Final results' : 'Next round',
            () => ctx.send({ t: 'leader', action: 'next' }),
            { id: 'next' },
          )
        : para('Watch the TV', 'caption'),
      emojiBar(s, ctx),
    ];
  });
}

/**
 * The feedback form in a new tab. A plain link, so this page never navigates away; `noopener` cuts the
 * form's tab off from this one. The socket stays up, and net-client reconnects at once if the phone
 * dropped it while the player was in the other tab.
 */
function feedbackLink(): HTMLAnchorElement {
  return el('a', {
    class: 'btn btn--pink btn-link',
    href: feedbackUrl(GAME_ID),
    target: '_blank',
    rel: 'noopener',
    'data-feedback': '',
    text: 'Give feedback',
  });
}

export function matchEndView(first: Screen, ctx: Ctx): View {
  // Built once: the screen re-renders on every update and must never swap it out from under a tap.
  const feedback = feedbackLink();
  return renderedView('matchEnd', first, (s) => [
    heading('Game over'),
    standingsList(s.standings, s.winners),
    s.isLeader
      ? el(
          'div',
          { class: 'leader-row' },
          button('Rematch', () => ctx.send({ t: 'leader', action: 'rematch' }), { id: 'rematch' }),
          button('Back to lobby', () => ctx.send({ t: 'leader', action: 'lobby' }), {
            id: 'lobby',
            cls: 'btn--quiet',
          }),
        )
      : para('Watch the TV', 'caption'),
    feedback,
  ]);
}
