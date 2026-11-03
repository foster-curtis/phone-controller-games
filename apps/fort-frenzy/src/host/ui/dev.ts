// `index.html?ui=<screen>` dev page (BUILD_PLAN FF5): the overlay over a stand-in for the canvas,
// fed a sample TvView. Home is live (keyboard and gamepad), the lobby arms/removes on its number keys.
import { DIFFICULTY_IDS, THEME_IDS } from '../../shared/ids';
import { createTvOverlay } from './overlay';
import { fitToWindow } from './layout';
import { UI_SCREENS, sampleView, type UiScreenName } from './samples';
import type { HomeRow, TvView } from './types';

const cycle = <T>(list: readonly T[], cur: T, dir: number): T =>
  list[(list.indexOf(cur) + dir + list.length) % list.length]!;

export function isUiScreen(name: string | null): name is UiScreenName {
  return name !== null && (UI_SCREENS as readonly string[]).includes(name);
}

export function mountUiDev(host: HTMLElement, name: UiScreenName): void {
  const bg = document.createElement('div');
  bg.className = 'ui-dev-bg';
  bg.innerHTML = '<div class="frame"><div class="safe"></div></div>';
  host.append(bg);
  const frame = bg.querySelector<HTMLElement>('.frame')!;
  fitToWindow(frame);

  let view: TvView = sampleView(name);
  const overlay = createTvOverlay(host, {
    onHome(intent) {
      const home = view.home;
      if (!home) return;
      if (intent.type === 'focus') home.focus = intent.index;
      else if (intent.type === 'cycle') {
        home.rows = home.rows.map((r): HomeRow => {
          if (r.id === 'theme' && intent.row === 'theme')
            return { id: 'theme', theme: cycle(THEME_IDS, r.theme, intent.dir) };
          if (r.id === 'difficulty' && intent.row === 'difficulty')
            return {
              id: 'difficulty',
              difficulty: cycle(DIFFICULTY_IDS, r.difficulty, intent.dir),
            };
          return r;
        });
      }
      overlay.update({ ...view });
    },
    onRemovePlayer(playerId) {
      if (!view.team) return;
      view = {
        ...view,
        team: { ...view.team, roster: view.team.roster.filter((p) => p.playerId !== playerId) },
      };
      overlay.update(view);
    },
  });
  overlay.update(view);
  document.body.dataset.uiScreen = name;
}
