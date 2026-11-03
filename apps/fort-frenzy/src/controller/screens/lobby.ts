// Lobby and class select (SPEC §11.1, §2.6): one view, so a thumb survives the switch. No class yet (or
// "Change class") shows the swipeable class cards; otherwise the lobby: your knight, Ready, the lineup
// with the leader mark, and for the party leader difficulty, theme, Start and remove.
import { el } from '@pcg/controller-kit';
import {
  CLASS_IDS,
  DIFFICULTY_IDS,
  THEME_IDS,
  type ClassId,
  type PlayerColorId,
} from '../../shared/ids';
import { ClassCard, ColorPicker, LineupRow, Portrait } from '../components';
import { CLASS_INFO, DIFFICULTY_NAME } from '../copy';
import { bindSwipe } from '../swipe';
import { createKeyedList, playerTag, type ScreenCtx, type Snapshot, type View } from './common';

/** Players needed Ready before the leader may force-start (SPEC §11.1). */
export const MIN_READY_TO_START = 2;

export function createLobby(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen lobby' });
  const tag = playerTag();
  const room = el('span', { class: 'room-code code', text: ctx.code ? `ROOM ${ctx.code}` : '' });
  root.append(tag.el, room);

  // ---- class select ----
  const strip = el('div', { class: 'class-strip' });
  const track = el('div', { class: 'class-track' }, strip);
  const dots = el('div', { class: 'dots' });
  const pick = el('button', { type: 'button', class: 'btn btn-primary pick' });
  const select = el(
    'div',
    { class: 'class-select' },
    el('p', { class: 'select-title tag', text: 'CHOOSE YOUR KNIGHT' }),
    track,
    dots,
    pick,
  );
  let index = 0;
  let cardsFor = '';

  const showIndex = (i: number) => {
    index = Math.max(0, Math.min(CLASS_IDS.length - 1, i));
    [...dots.children].forEach((d, n) => d.classList.toggle('on', n === index));
    pick.textContent = `PICK ${CLASS_INFO[CLASS_IDS[index]!].name.toUpperCase()}`;
  };
  // One card per swipe, however long (C1 note 2).
  const swipe = bindSwipe(track, strip, { count: () => CLASS_IDS.length, onIndex: showIndex });
  const setIndex = (i: number) => {
    swipe.setIndex(i, false);
    showIndex(i);
  };
  pick.addEventListener('click', () => {
    const classId = CLASS_IDS[index]!;
    ctx.intent({ k: 'class', classId });
    choosing = false;
    if (last) render(last);
  });

  // ---- lobby ----
  const knight = el('div', { class: 'knight' });
  const className = el('h2', { class: 'h2 knight-name' });
  const change = el('button', { type: 'button', class: 'link-btn', text: 'Change class' });
  const ready = el('button', { type: 'button', class: 'btn btn-primary ready' });
  const hint = el('p', { class: 'hint body' });
  const colorsHost = el('div', { class: 'color-host' });
  const lineupTitle = el('p', { class: 'lineup-title tag' });
  const lineupHost = el('div', { class: 'lineup' });
  const lineup = createKeyedList(lineupHost);
  const leaderBox = el('div', { class: 'leader-box' });
  const diffRow = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Difficulty' });
  const start = el('button', { type: 'button', class: 'btn btn-outline start', text: 'START' });
  const startHint = el('p', { class: 'hint body' });
  leaderBox.append(
    el('p', { class: 'leader-title tag', text: 'PARTY LEADER' }),
    diffRow,
    el('div', { class: 'leader-actions' }, start),
    startHint,
  );
  const lobby = el(
    'div',
    { class: 'lobby-main' },
    el('div', { class: 'lobby-knight' }, knight, className, change, colorsHost),
    el('div', { class: 'lobby-ready' }, ready, hint),
    el('div', { class: 'lobby-side' }, lineupTitle, lineupHost, leaderBox),
  );
  root.append(select, lobby);

  change.addEventListener('click', () => {
    choosing = true;
    if (last) render(last);
  });
  ready.addEventListener('click', () => last && ctx.intent({ k: 'ready', ready: !last.me.ready }));
  start.addEventListener('click', () => ctx.intent({ k: 'leader', action: 'start' }));

  let choosing = false;
  let last: Snapshot | null = null;

  const render = (s: Snapshot) => {
    last = s;
    const { me, team } = s;
    tag.set(me);
    const showSelect = me.classId === null || choosing;
    root.classList.toggle('selecting', showSelect);
    select.hidden = !showSelect;
    lobby.hidden = showSelect;

    if (showSelect) {
      const key = me.color ?? 'none';
      if (cardsFor !== key) {
        cardsFor = key;
        strip.replaceChildren(...CLASS_IDS.map((id) => ClassCard(id, me.color)));
        dots.replaceChildren(...CLASS_IDS.map(() => el('i', { class: 'dot' })));
        const at = me.classId ? CLASS_IDS.indexOf(me.classId) : 0;
        setIndex(at);
        requestAnimationFrame(() => setIndex(at));
      }
      return;
    }

    const info = CLASS_INFO[me.classId as ClassId];
    knight.replaceChildren(Portrait(me.classId as ClassId, me.color));
    className.textContent = info.name;
    const counting = team.phase === 'countdown';
    // Ready keeps its label; once set, it and every other lobby action darken until un-ready (C1 note 4).
    root.classList.toggle('is-ready', me.ready);
    ready.textContent = counting ? 'STARTING…' : 'READY';
    ready.disabled = counting;
    ready.classList.toggle('dark', me.ready);
    ready.setAttribute('aria-pressed', String(me.ready));
    change.disabled = me.ready;
    const takenColors = new Set<PlayerColorId>(
      team.roster.filter((p) => p.playerId !== ctx.myId()).map((p) => p.color),
    );
    colorsHost.replaceChildren(
      ColorPicker({
        mine: me.color,
        taken: takenColors,
        disabled: me.ready || counting,
        onPick: (color) => ctx.intent({ k: 'color', color }),
      }),
    );
    hint.textContent = counting
      ? 'Get set.'
      : me.ready
        ? 'Tap again to un-ready.'
        : 'Everyone ready: 3-second countdown.';
    lineupTitle.textContent = `LINEUP · ${team.roster.length} OF 6`;
    lineup.set(
      team.roster.map((p) => ({
        key: p.playerId,
        sig: [
          p.name,
          p.color,
          p.classId,
          p.ready,
          p.connected,
          team.leaderId === p.playerId,
          me.isLeader,
          me.ready,
        ].join('|'),
        make: () => ({
          el: LineupRow(p, {
            leader: team.leaderId === p.playerId,
            me: p.playerId === ctx.myId(),
            canRemove: me.isLeader && p.playerId !== ctx.myId() && !me.ready,
            onRemove: () => ctx.intent({ k: 'leader', action: 'remove', playerId: p.playerId }),
          }),
        }),
      })),
    );

    leaderBox.hidden = !me.isLeader;
    if (me.isLeader) {
      diffRow.replaceChildren(
        ...DIFFICULTY_IDS.map((d) => {
          const b = el('button', {
            type: 'button',
            class: `seg${team.difficulty === d ? ' on' : ''}`,
            'data-difficulty': d,
            text: DIFFICULTY_NAME[d],
          });
          b.disabled = me.ready;
          b.setAttribute('aria-pressed', String(team.difficulty === d));
          b.addEventListener('click', () =>
            ctx.intent({ k: 'leader', action: 'difficulty', difficulty: d }),
          );
          return b;
        }),
        // One theme in v1: the switch appears when a second ships.
        ...(THEME_IDS.length > 1
          ? THEME_IDS.map((t) => {
              const b = el('button', {
                type: 'button',
                class: `seg${team.theme === t ? ' on' : ''}`,
                'data-theme': t,
                text: t,
              });
              b.addEventListener('click', () =>
                ctx.intent({ k: 'leader', action: 'theme', theme: t }),
              );
              return b;
            })
          : []),
      );
      const readyCount = team.roster.filter((p) => p.ready).length;
      start.disabled = counting || me.ready || readyCount < MIN_READY_TO_START;
      startHint.textContent =
        readyCount < MIN_READY_TO_START
          ? `Start works once ${MIN_READY_TO_START} players are ready.`
          : 'Start now, or wait for everyone.';
    }
  };

  return {
    el: root,
    update: render,
    destroy() {
      swipe.destroy();
      lineup.destroy();
    },
  };
}
