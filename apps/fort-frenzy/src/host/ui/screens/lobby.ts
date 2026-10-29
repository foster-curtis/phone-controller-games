// Lobby (SPEC §2.6, §11.1): join URL, large mono room code, QR, six slots with each knight's front
// view in the player's color, a name band, class and ready state; open slots dashed. The TV can remove
// a player by pressing the slot's number twice (arm, then confirm).
import type { Section } from '../render';
import type { RenderCtx } from '../render';
import { esc, icon, portrait, qrSvg } from '../html';
import {
  CLASS_ICON,
  CLASS_NAME,
  COLOR_ON_VAR,
  COLOR_VAR,
  DIFFICULTY_NAME,
  shortUrl,
} from '../labels';
import type { TeamRosterEntry } from '../../../shared/messages';
import type { TvView } from '../types';

export const MAX_SLOTS = 6;

function slot(p: TeamRosterEntry, i: number, leader: boolean, armed: boolean): string {
  const status = !p.connected
    ? `<span class="st off">${icon('reconnecting')}Reconnecting</span>`
    : p.classId === null
      ? `<span class="st">Choosing…</span>`
      : p.ready
        ? `<span class="st ready">${icon('ready')}Ready</span>`
        : `<span class="st">Choosing…</span>`;
  const cls = p.classId ? esc(CLASS_NAME[p.classId]) : 'No class yet';
  return (
    `<div class="slot ${p.connected ? '' : 'dim'} ${armed ? 'armed' : ''}" style="--pc:${COLOR_VAR(p.color)};--pon:${COLOR_ON_VAR(p.color)}">` +
    `<div class="slot-art">${p.classId ? portrait(p.classId, p.color) : ''}<span class="num">${i + 1}</span></div>` +
    `<div class="band"><span class="nm">${esc(p.name)}</span>${leader ? `<span class="lead">${icon('leader')}Leader</span>` : ''}</div>` +
    `<div class="slot-info"><span class="cls">${p.classId ? icon(CLASS_ICON[p.classId], 'sm') : ''}${cls}</span>${status}</div>` +
    (armed ? `<div class="arm-note">Press ${i + 1} again to remove</div>` : '') +
    `</div>`
  );
}

export function lobbySections(view: TvView, ctx: RenderCtx): Section[] {
  const team = view.team;
  const roster = team?.roster ?? [];
  const room = view.room;
  const code = (room?.code ?? '').split('');
  const slots: string[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const p = roster[i];
    slots.push(
      p
        ? slot(p, i, p.playerId === team?.leaderId, ctx.armedSlot === i)
        : `<div class="slot open"><span class="body">Open slot</span></div>`,
    );
  }
  const diff = team ? ` · ${esc(DIFFICULTY_NAME[team.difficulty])}` : '';
  const out: Section[] = [
    {
      name: 'lobby',
      html:
        `<div class="lobby">` +
        `<div class="tag muted j1">Join on your phone</div>` +
        `<div class="url">${esc(room ? shortUrl(room.joinUrl) : '')}</div>` +
        `<div class="tag muted j2">Room code</div>` +
        `<div class="code">${code.map((c) => `<span class="ch">${esc(c)}</span>`).join('')}</div>` +
        `<div class="qrbox">${room?.qr ? qrSvg(room.qr) : '<span class="qr ph"></span>'}</div>` +
        `<div class="tag muted scan">Scan to join</div>` +
        `<div class="h2 lineup">Lineup</div>` +
        `<div class="tag muted count">${roster.length} of ${MAX_SLOTS}${diff}</div>` +
        `<div class="tag muted rmhint">Press a slot number twice to remove a player</div>` +
        `<div class="slots">${slots.join('')}</div>` +
        `</div>`,
    },
  ];
  if (view.countdownMs !== null && view.screen === 'countdown') {
    const n = Math.max(1, Math.ceil(view.countdownMs / 1000));
    out.push({
      name: 'countdown',
      html: `<div class="cd"><div class="tag">Starting in</div><div class="title">${n}</div></div>`,
    });
  }
  return out;
}
