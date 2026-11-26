// `/play?dev=1` offline controller (SPEC §12.7; AGENTS.md): the controller-kit dev harness with a fake
// client playing canned host messages for every screen and sheet, a live input readout, overlay toggles,
// and a tiny host stand-in (join, color, ready, grab holds). `?screen=<id>` starts on one sample (e2e,
// screenshots). Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature. Never imports host code.
import { createDevHarness, createLocalClient } from '@pcg/controller-kit';
import { BIT_HOLD, isPhoneMsg, type HostMsg, type PhoneMsg } from '../shared/messages';
import { PLAYER_COLOR_IDS } from '../shared/theme';
import { createApp, OVERLAY_NAMES, type App } from './app';
import { PLAYERS, SAMPLE_IDS, SAMPLES, STALL } from './samples';

export function startDev(root: HTMLElement, search: string = location.search): App {
  const client = createLocalClient();
  const dev = createDevHarness(root);
  const params = new URLSearchParams(search);
  const players = PLAYERS.map((p) => ({ ...p }));
  let holdId = 0;
  let hold: { id: number; timer: ReturnType<typeof setTimeout> } | null = null;

  const emit = (m: HostMsg) => client.emit(m);
  const lobby = () =>
    emit({ t: 'screen', screen: { s: 'lobby', players: [...players], you: 0, canStart: true } });
  const endHold = (result: 'complete' | 'cancelled') => {
    if (!hold) return;
    clearTimeout(hold.timer);
    emit({ t: 'holdEnd', id: hold.id, result });
    hold = null;
  };

  // The host stand-in answers the phone's messages (offline: no relay).
  const onSent = (m: PhoneMsg) => {
    if (!isPhoneMsg(m)) return;
    if (m.t === 'input') {
      dev.setReadout([m.x, m.y, m.bits]);
      if (!(m.bits & BIT_HOLD)) endHold('cancelled');
    } else if (m.t === 'join') queueMicrotask(() => emit({ t: 'joined', name: m.name }));
    else if (m.t === 'color') {
      players[0]!.color = m.color;
      lobby();
    } else if (m.t === 'ready') {
      players[0]!.ready = m.ready;
      lobby();
    } else if (m.t === 'grab') {
      const tile = [...STALL.counter, ...STALL.shelf].find((i) => i.slot === m.slot);
      const durationMs = tile?.grabMs ?? 800;
      const id = ++holdId;
      emit({
        t: 'holdStart',
        id,
        kind: 'grab',
        durationMs,
        elapsedMs: 0,
        stall: m.stall,
        slot: m.slot,
      });
      hold = { id, timer: setTimeout(() => endHold('complete'), durationMs) };
    }
  };

  const app = createApp({ root: dev.stage, client, code: 'DEVV', onSent });
  dev.setReadout(app.controls.tuple());

  const show = (id: string) => {
    const s = SAMPLES[id]!();
    for (const m of s.msgs) emit(m);
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
        players[0]!.color = c;
        lobby();
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

  const first = params.get('screen');
  if (first && SAMPLES[first]) show(first);
  return app;
}

export function mount(root: HTMLElement): void {
  startDev(root);
}
