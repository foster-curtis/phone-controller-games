// TV results and match end (SPEC §6.2 step 6, §6.6). Standings lowest first; ties share a rank.
import type { TvView } from '../match/types';
import { chip, h, rankStandings, standingsList } from './dom';

export function renderResults(v: Extract<TvView, { phase: 'results' }>): HTMLElement {
  const el = h('section', 'view results');
  const round = h('div', 'round');
  round.append(h('h1', 'banner', 'Round results'));
  const list = h('ul', 'caught-list');
  for (const c of v.caught.filter((x) => x.count > 0)) {
    const li = h('li', 'body');
    li.append(chip(c, 'chip name'), ` caught ×${c.count}`);
    list.append(li);
  }
  if (list.childElementCount === 0) list.append(h('li', 'body', 'Nobody was caught!'));
  const delta = `${v.photographerDelta > 0 ? '+' : ''}${v.photographerDelta}`;
  round.append(list, h('p', 'h2', `${v.photographer.name}: ${delta}`));
  el.append(round, standingsList(v.standings));
  return el;
}

export function renderMatchEnd(v: Extract<TvView, { phase: 'matchEnd' }>): HTMLElement {
  const el = h('section', 'view matchEnd');
  const ranked = rankStandings(v.standings);
  el.append(h('p', 'caption', 'Hardest to photograph'));
  const winners = h('div', 'winners');
  for (const s of ranked.filter((r) => v.winners.includes(r.playerId))) {
    winners.append(chip(s, 'chip huge'));
  }
  el.append(winners);

  // Plain podium: one step per distinct rank (top 3); ties stand side by side.
  const podium = h('div', 'podium');
  for (const rank of [...new Set(ranked.map((s) => s.rank))].slice(0, 3)) {
    const step = h('div', 'step');
    step.dataset.rank = String(rank);
    step.append(h('span', 'score', String(rank)));
    for (const s of ranked.filter((r) => r.rank === rank)) step.append(chip(s, 'chip name'));
    podium.append(step);
  }
  el.append(podium, standingsList(v.standings));
  return el;
}
