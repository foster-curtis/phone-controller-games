// Victory and defeat summary (SPEC §4, §2.6): banner over the keep, run stats, one award card per
// player in their color. The party leader's phone picks what happens next (§4), so the TV only waits.
// Top right: the feedback QR (PLATFORM decision #11).
import { feedbackHtml } from '../feedback';
import type { Section } from '../render';
import { badge, esc } from '../html';
import { AWARD, CLASS_ICON, COLOR_VAR, DIFFICULTY_NAME, fmtClock, fmtInt } from '../labels';
import { TOTAL_WAVES } from './hud';
import type { TvView } from '../types';

export function summarySections(view: TvView): Section[] {
  const team = view.team;
  const s = team?.summary;
  if (!team || !s) return [];
  const win = s.result === 'victory';
  const leader = team.roster.find((p) => p.playerId === team.leaderId)?.name;
  const bits = [
    `${s.wavesSurvived} of ${TOTAL_WAVES} waves`,
    fmtClock(s.durationMs),
    DIFFICULTY_NAME[team.difficulty],
    win ? 'Colossus defeated' : null,
  ].filter((x): x is string => x !== null);
  const cards = s.players
    .map((p) => {
      const key = p.award ?? 'damageDealt';
      const a = AWARD[key];
      return (
        `<div class="award" style="--pc:${COLOR_VAR(p.color)}">` +
        `<div class="ah">${badge(CLASS_ICON[p.classId])}<div class="at"><span class="tag muted">${esc(a.label)}</span><span class="nm">${esc(p.name)}</span></div></div>` +
        `<div class="score val">${fmtInt(p.stats[key])}</div></div>`
      );
    })
    .join('');
  return [
    {
      name: 'summary',
      html:
        `<div class="summary ${win ? 'win' : 'loss'}">` +
        `<div class="tag kicker">${win ? 'Victory' : 'Defeat'}</div>` +
        `<div class="banner">${win ? 'The Citadel stands' : 'The Citadel has fallen'}</div>` +
        `<div class="body sub">${esc(bits.join(' · '))}</div>` +
        `<div class="awards">${cards}</div>` +
        feedbackHtml() +
        `<div class="body foot">${leader ? `Waiting for ${esc(leader)} to choose: ` : 'Choose: '}Play again, Change classes or Return to home</div>` +
        `</div>`,
    },
  ];
}
