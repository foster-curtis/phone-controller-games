// End of run (SPEC §4, §2.6): result banner, waves survived, one award card per player in their color,
// and the party leader's three options (play again, change classes, home). Everyone gets Give feedback
// (PLATFORM decision #11).
import { feedbackUrl } from '@pcg/catalog';
import { el } from '@pcg/controller-kit';
import { GAME_ID, type RunSummary } from '../../shared/messages';
import { colorOnVar, colorVar, icon } from '../components';
import { CLASS_INFO, STAT_LABEL } from '../copy';
import { formatClock, type ScreenCtx, type Snapshot, type View } from './common';

const OPTIONS = [
  { option: 'again', label: 'PLAY AGAIN', cls: 'btn btn-primary' },
  { option: 'classes', label: 'CHANGE CLASSES', cls: 'btn' },
  { option: 'home', label: 'HOME', cls: 'btn' },
] as const;

export function createSummary(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen summary' });
  const banner = el('h1', { class: 'banner summary-banner' });
  const sub = el('p', { class: 'label summary-sub' });
  const awards = el('div', { class: 'awards' });
  const options = el('div', { class: 'summary-options' });
  const wait = el('p', { class: 'hint body', text: 'Waiting for the party leader…' });
  // The form in a new tab: a plain link, so this page never navigates away (`noopener` cuts the
  // form's tab off from this one). The socket stays up; net-client reconnects at once on return if
  // the phone dropped it. Built once, never re-rendered under a tap.
  const feedback = el('a', {
    class: 'btn btn-link',
    href: feedbackUrl(GAME_ID),
    target: '_blank',
    rel: 'noopener',
    'data-feedback': '',
    text: 'GIVE FEEDBACK',
  });
  root.append(banner, sub, awards, options, wait, feedback);

  const card = (p: RunSummary['players'][number], mine: boolean) => {
    const info = CLASS_INFO[p.classId];
    const n = p.award ? p.stats[p.award] : null;
    const node = el(
      'div',
      { class: `award${mine ? ' me' : ''}`, 'data-player': p.playerId },
      el('span', { class: 'award-name tag', text: p.name }),
      icon(`class-${info.rig}`, 'award-helm'),
      el('span', { class: 'award-class', text: info.name.toUpperCase() }),
      p.award && n !== null
        ? el('span', {
            class: 'award-stat',
            text: `${STAT_LABEL[p.award] ?? p.award} ${Math.round(n).toLocaleString('en-US')}`,
          })
        : el('span', { class: 'award-stat', text: `Kills ${p.stats.kills}` }),
    );
    node.style.setProperty('--award-color', colorVar(p.color));
    node.style.setProperty('--award-on', colorOnVar(p.color));
    return node;
  };

  const update = ({ me, team }: Snapshot) => {
    const s = team.summary;
    banner.textContent = s ? (s.result === 'victory' ? 'VICTORY' : 'DEFEAT') : 'RUN OVER';
    root.dataset.result = s?.result ?? 'none';
    sub.textContent = s ? `Waves survived ${s.wavesSurvived} · ${formatClock(s.durationMs)}` : '';
    const myId = ctx.myId();
    awards.replaceChildren(
      ...(s?.players ?? []).map((p) => card(p, p.playerId === myId || p.name === me.name)),
    );
    options.hidden = !me.isLeader;
    wait.hidden = me.isLeader;
    options.replaceChildren(
      ...OPTIONS.map((o) => {
        const b = el('button', {
          type: 'button',
          class: o.cls,
          'data-option': o.option,
          text: o.label,
        });
        b.addEventListener('click', () =>
          ctx.intent({ k: 'leader', action: 'end', option: o.option }),
        );
        return b;
      }),
    );
  };

  return { el: root, update, destroy() {} };
}
