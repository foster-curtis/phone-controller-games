// Home (SPEC §2.6 TV screens, §11.1, §15.8): the focused row is lit amber, ◂ ▸ change theme and
// difficulty, "Resume wave N" appears only when a snapshot exists, and the audio loading bar has a slot.
import type { Section } from '../render';
import { esc, panel } from '../html';
import { DIFFICULTY_NAME, THEME_NAME, fmtSavedAgo, shortUrl } from '../labels';
import type { HomeRow, TvView } from '../types';

const arrows = (inner: string) =>
  `<span class="arr l"></span><span class="val">${inner}</span><span class="arr r"></span>`;

function row(r: HomeRow, focused: boolean): string {
  const cls = `row ${r.id === 'create' ? 'primary' : ''} ${focused ? 'focus' : ''}`;
  switch (r.id) {
    case 'create':
      return panel(`<span class="lbl">Create room</span>`, cls);
    case 'theme':
      return panel(`<span class="lbl">Theme</span>${arrows(esc(THEME_NAME[r.theme]))}`, cls);
    case 'difficulty':
      return panel(
        `<span class="lbl">Difficulty</span>${arrows(esc(DIFFICULTY_NAME[r.difficulty]))}`,
        cls,
      );
    case 'resume':
      return panel(
        `<span class="lbl">Resume wave ${r.wave}</span><span class="val plain">${esc(fmtSavedAgo(r.savedAgoMs))}</span>`,
        cls,
      );
    case 'newRun':
      return panel(`<span class="lbl">New run</span>`, cls);
  }
}

export function homeSections(view: TvView): Section[] {
  const home = view.home ?? { rows: [], focus: 0, loading: view.screen === 'loading' ? 0 : 1 };
  const loading = home.loading < 1;
  const rows = home.rows.map((r, i) => row(r, i === home.focus)).join('');
  const pct = Math.round(Math.min(Math.max(home.loading, 0), 1) * 100);
  // A saved run reclaims its room before the choice: phones rejoining a new room need the code (§15.8).
  const room = view.room
    ? `<div class="homeroom"><span class="tag muted">Room</span><span class="code">${esc(view.room.code)}</span>` +
      `<span class="body url">${esc(shortUrl(view.room.joinUrl))}</span></div>`
    : '';
  return [
    {
      name: 'home',
      html:
        `<div class="home">` +
        `<img class="logo" src="/apple-icon.png" alt="" />` +
        `<div class="title">Fort Frenzy</div>` +
        `<div class="body tagline">Hold the line together. 2 to 6 players, phones as controllers.</div>` +
        `<div class="rows">${rows}</div>` +
        room +
        `<div class="hint tag">Arrows or d-pad to move · Enter or A to select</div>` +
        `<div class="loadslot ${loading ? 'on' : ''}"><span class="tag">Loading audio</span>` +
        `<span class="bar"><i style="width:${pct}%"></i></span></div>` +
        `</div>`,
    },
  ];
}
