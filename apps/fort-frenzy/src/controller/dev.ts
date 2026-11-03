// Offline dev mode (`play.html?dev=1`, SPEC §15.7): no relay. The kit's local client drives the real app
// with sample `team` / `me` snapshots for every screen and state, a live tuple readout, overlay toggles.
// `?screen=<id>` starts on one sample (e2e, screenshots).
import { createDevHarness, createLocalClient } from '@pcg/controller-kit';
import { PLAYER_COLOR_IDS } from '../shared/ids';
import { isControllerMsg, isInputTuple } from '../shared/messages';
import { OVERLAY_NAMES, createApp, type App } from './app';
import { SAMPLES, SAMPLE_IDS } from './samples';

export function startDev(root: HTMLElement, search: string = location.search): App {
  const client = createLocalClient();
  const dev = createDevHarness(root);
  const params = new URLSearchParams(search);
  const app = createApp({
    root: dev.stage,
    client,
    code: 'DEV1',
    onSent: (m) => {
      if (isInputTuple(m)) dev.setReadout(m);
      // The color picker works offline: the host's swap rule is FF2-fix-1's, so just take it.
      else if (
        isControllerMsg(m) &&
        !Array.isArray(m) &&
        m.t === 'intent' &&
        m.intent.k === 'color'
      ) {
        color = m.intent.color;
        show(current);
      }
    },
  });
  dev.setReadout(app.sender.tuple());

  let rev = 0;
  let current = 'combat';
  let color: (typeof PLAYER_COLOR_IDS)[number] | null = null;
  const show = (id: string) => {
    current = id;
    const s = SAMPLES[id]!();
    const me = color && s.me.color ? { ...s.me, color } : s.me;
    const team = color
      ? {
          ...s.team,
          roster: s.team.roster.map((p) => (p.playerId === 'dev' ? { ...p, color } : p)),
        }
      : s.team;
    rev++;
    client.emit({ t: 'team', rev, team });
    client.emit({ t: 'me', rev, me });
    if (s.after) setTimeout(() => s.after?.(dev.stage), 0);
  };

  dev.addRow(
    'screen',
    SAMPLE_IDS.map((id) => ({ id, onClick: () => show(id) })),
  );
  dev.addRow(
    'color',
    PLAYER_COLOR_IDS.map((c) => ({
      id: c,
      onClick: () => {
        color = c;
        show(current);
      },
    })),
  );
  dev.addRow(
    'overlay',
    OVERLAY_NAMES.map((name) => ({
      id: name,
      onClick: () => {
        const on = !app.overlays().includes(name);
        if (name === 'reconnecting') client.setStatus(on ? 'reconnecting' : 'open');
        else if (name === 'hostAway') client.setHostStatus(on ? 'away' : 'present');
        else app.setOverlay(name, on);
      },
    })),
  );
  dev.addRow('misc', [{ id: 'removed', onClick: () => app.showRemoved() }]);

  const start = params.get('screen');
  show(start && SAMPLES[start] ? start : 'combat');
  return app;
}
