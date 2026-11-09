// TV lobby (SPEC §6.6, §6.3.1): QR + room code, joined players (color, ready, no-camera badge), leader,
// sound. Seats sharing a phone are grouped under the phone's first player with a 📱 marker.
import { joinUrl, qrMatrix } from '@pcg/game-kit';
import type { TvView } from '../match/types';
import { chip, h, type TvControls } from './dom';

type Lobby = Extract<TvView, { phase: 'lobby' }>;

const SVG = 'http://www.w3.org/2000/svg';

/** The join link as inline SVG (no canvas, so it renders in jsdom and scales crisply). */
export function qrSvg(text: string): SVGSVGElement {
  const { size, modules } = qrMatrix(text);
  const pad = 2;
  const full = String(size + pad * 2);
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'qr');
  svg.setAttribute('viewBox', `0 0 ${full} ${full}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Join QR code');
  const bg = document.createElementNS(SVG, 'rect');
  bg.setAttribute('width', full);
  bg.setAttribute('height', full);
  bg.setAttribute('fill', '#fff');
  const path = document.createElementNS(SVG, 'path');
  let d = '';
  modules.forEach((m, i) => {
    if (m) d += `M${(i % size) + pad} ${Math.floor(i / size) + pad}h1v1h-1z`;
  });
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

export function renderLobby(v: Lobby, c: TvControls): HTMLElement {
  const el = h('section', 'view lobby');
  const join = h('div', 'join');
  if (v.code) {
    join.append(
      qrSvg(joinUrl(c.origin, v.code)),
      h('div', 'label', 'Join with code'),
      h('div', 'code-tv code', v.code),
    );
  } else {
    join.append(h('div', 'h2', 'Opening room…'));
  }
  const sound = h('button', 'btn sound', '🔊 Sound on');
  sound.type = 'button';
  sound.addEventListener('click', () => {
    void c.sfx.unlock();
    sound.disabled = true;
    sound.textContent = '🔊 Sound is on';
  });
  join.append(sound);

  const roster = h('div', 'roster');
  roster.append(h('h1', 'banner', 'Say Cheese!'));
  if (v.leaderName) roster.append(h('p', 'body leader', `Leader: ${v.leaderName}`));
  const list = h('ul', 'players');
  const groups = new Map<string, typeof v.players>();
  for (const p of v.players) {
    const g = groups.get(p.phoneId);
    if (g) g.push(p);
    else groups.set(p.phoneId, [p]);
  }
  const row = (p: (typeof v.players)[number]): HTMLLIElement => {
    const li = h('li', 'player');
    li.dataset.player = p.playerId;
    if (!p.connected) li.classList.add('dim');
    li.append(chip(p, 'chip name'));
    if (p.camera === 'denied') li.append(h('span', 'badge warn', 'no camera'));
    li.append(h('span', p.ready ? 'badge ok' : 'badge', p.ready ? 'Ready' : 'Not ready'));
    const x = h('button', 'btn x', '✕');
    x.type = 'button';
    x.setAttribute('aria-label', `Remove ${p.name}`);
    x.addEventListener('click', () => c.emit({ action: 'remove', playerId: p.playerId }));
    li.append(x);
    return li;
  };
  for (const [phoneId, seats] of groups) {
    const [first, ...others] = seats;
    if (!first) continue;
    const li = row(first);
    if (others.length > 0) {
      li.dataset.phone = phoneId;
      li.classList.add('shared-phone');
      const mark = h('span', 'phone-mark', '📱');
      mark.setAttribute('title', 'Shared phone');
      li.querySelector('.chip')?.after(mark);
      const sub = h('ul', 'players shared');
      for (const o of others) sub.append(row(o));
      li.append(sub);
    }
    list.append(li);
  }
  if (v.players.length === 0) list.append(h('li', 'body', 'Scan the code to join'));
  roster.append(list);
  el.append(join, roster);
  return el;
}
