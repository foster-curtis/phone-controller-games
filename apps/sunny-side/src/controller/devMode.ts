// Offline dev mode (`play.html?dev=1`): no relay. The kit's local fake client drives the real app, with
// a live input-tuple readout and a switcher for every Screen variant, player color and overlay.
import { createDevHarness, createLocalClient } from '@pcg/controller-kit';
import { PLAYER_COLOR_IDS, isInput, type PlayerColorId, type ScreenKind } from '../shared/messages';
import { createApp, OVERLAY_NAMES, type App } from './app';
import { sampleScreen } from './samples';
import { SCREEN_KINDS } from './screens';

export function startDev(root: HTMLElement): App {
  const client = createLocalClient();
  const dev = createDevHarness(root);

  const app = createApp({
    root: dev.stage,
    client,
    code: 'DEV1',
    onSent: (m) => {
      if (isInput(m)) dev.setReadout(m);
    },
  });
  dev.setReadout(app.sender.tuple());

  // Current sample (kind + player color), so the banner/pad colors can be checked per player color.
  let curKind: ScreenKind = 'playing';
  let curColor: PlayerColorId = 'crimson';
  const emit = () => client.emit({ t: 'screen', screen: sampleScreen(curKind, curColor) });
  dev.addRow('screen', [
    ...SCREEN_KINDS.map((kind) => ({
      id: kind,
      onClick: () => {
        curKind = kind;
        emit();
      },
    })),
    { id: 'removed', onClick: () => app.showRemoved() },
  ]);
  dev.addRow(
    'color',
    PLAYER_COLOR_IDS.map((color) => ({
      id: color,
      onClick: () => {
        curColor = color;
        emit();
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

  client.emit({ t: 'screen', screen: sampleScreen('playing') });
  return app;
}
