// TV results and match end (SPEC §6.2 step 6, §6.6). Standings lowest first; ties share a rank. The
// catches pop in one by one; the match end is a podium where tied winners share the top step (SC9).
import type { TvView } from '../match/types';
import { chip, h, rankStandings, rays, standingsList } from './dom';

export function renderResults(v: Extract<TvView, { phase: 'results' }>): HTMLElement {
  const el = h('section', 'view results');
  const round = h('div', 'round');
  round.append(h('h1', 'banner', 'Round results'));
  const list = h('ul', 'caught-list');
  for (const [i, c] of v.caught.filter((x) => x.count > 0).entries()) {
    const li = h('li', 'body catch');
    li.style.setProperty('--i', String(i));
    li.append(chip(c, 'chip name'), h('span', 'marker', ` caught ×${c.count}`));
    list.append(li);
  }
  if (list.childElementCount === 0) list.append(h('li', 'body catch', 'Nobody was caught!'));
  const delta = `${v.photographerDelta > 0 ? '+' : ''}${v.photographerDelta}`;
  round.append(list, h('p', 'pill delta', `📸 ${v.photographer.name}: ${delta}`));
  el.append(round, standingsList(v.standings));
  return el;
}

export function renderMatchEnd(v: Extract<TvView, { phase: 'matchEnd' }>): HTMLElement {
  const el = h('section', 'view matchEnd');
  const ranked = rankStandings(v.standings);
  el.append(rays(), h('p', 'marker-tv', 'Hardest to photograph'));
  // Every winner, side by side: a tie shares the win (SPEC §6.1).
  const winners = h('div', 'winners');
  for (const s of ranked.filter((r) => v.winners.includes(r.playerId))) {
    winners.append(chip(s, 'chip huge'));
  }
  el.append(winners);

  // Podium: one step per distinct rank (top 3), first place in the middle; ties stand side by side.
  const podium = h('div', 'podium');
  const places = [...new Set(ranked.map((s) => s.rank))].slice(0, 3);
  for (const [place, rank] of places.entries()) {
    const step = h('div', 'step');
    step.dataset.rank = String(rank);
    step.dataset.place = String(place + 1);
    const who = h('div', 'who-col');
    for (const s of ranked.filter((r) => r.rank === rank)) who.append(chip(s, 'chip name'));
    step.append(who, h('span', 'block score', String(rank)));
    podium.append(step);
  }
  const board = h('div', 'board');
  board.append(podium, standingsList(v.standings));
  el.append(board);
  return el;
}
