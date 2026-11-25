// Gallery pages for the redesign's builds and portals (REDESIGN_BUILD_PLAN RD12; SPEC §7.5, §15.2):
// every build's real view (`scene/builds/*`) in every state, with the shield generator's field, the
// beacon's pulse, the mine armed and in its trigger delay and the rally flag's flight parts, and the
// portals idle and flaring on each side.
import { content } from '../../../content';
import type { BuildId } from '../../../shared/ids';
import { theme } from '../../../shared/theme';
import { placeFrame } from '../context';
import { BEACON_PULSE_R } from '../keys';
import {
  BUILD_PHASES,
  type BuildPhase,
  type BuildView,
  type BuildViewFactory,
  type BuildViewState,
} from '../types';
import type { PageKit } from './pages';

const modules = import.meta.glob<{ view?: BuildViewFactory }>('../../scene/builds/*.ts', {
  eager: true,
});
const VIEWS = new Map(
  Object.values(modules).flatMap((m) => (m.view ? [[m.view.id, m.view] as const] : [])),
);

/** Throw loop of the flight column, ms, and the beacon's pulse period. */
const FLIGHT_MS = 1800;
const PULSE_EVERY_MS = 2400;

interface Column {
  label: string;
  phase: BuildPhase;
  triggered?: boolean;
}

const COLUMNS: Column[] = [
  ...BUILD_PHASES.map((phase) => ({ label: phase, phase })),
  { label: 'trigger (mine)', phase: 'active', triggered: true },
];

export function buildsPage(k: PageKit) {
  const w = k.world;
  const owner = theme.players[k.state.color].fill.num;
  const ids: BuildId[] = ['shield_gen', 'beacon', 'mine', 'rally_flag'];
  ids.forEach((id, r) => {
    const factory = VIEWS.get(id);
    const def = content.builds.find((b) => b.id === id);
    if (!factory || !def) return;
    const sy = 230 + r * 230;
    k.label(id, 90, sy - 120, 16);
    COLUMNS.forEach((col, c) => {
      if (col.triggered && id !== 'mine') return;
      const sx = 330 + c * 250;
      const view: BuildView = factory.create(w);
      const [x, y] = [(sx - 400) / 48, (sy - 200) / 24];
      const state: BuildViewState = {
        phase: col.phase,
        x,
        y,
        sx,
        sy,
        z: 0,
        flightU: 1,
        hpFrac: col.phase === 'damaged' ? 0.35 : 1,
        radius: Math.min(def.radius, 3),
        clockMs: 0,
        triggered: col.triggered,
        nextPulse: 0,
        ownerTint: owner,
      };
      k.label(col.label, sx, sy + 30);
      const flying = col.phase === 'flight';
      k.tick((dt, t) => {
        state.clockMs = t;
        if (flying) {
          state.flightU = (t % FLIGHT_MS) / FLIGHT_MS;
          state.z = 4 * 1.6 * state.flightU * (1 - state.flightU);
        }
        // The beacon's pulse ring goes off on each change of the sim's next-pulse tick.
        if (id === 'beacon') state.nextPulse = Math.floor(t / PULSE_EVERY_MS);
        view.update(state, dt);
      });
    });
  });
  // The pulse ring's own radius, for scale.
  k.label(`beacon pulse ring r ${BEACON_PULSE_R}`, 1500, 150, 10);
}

export function portalsPage(k: PageKit) {
  const w = k.world;
  const sides = ['bottom', 'left', 'right'] as const;
  sides.forEach((side, r) => {
    (['idle', 'flare'] as const).forEach((look, c) => {
      const frame = w.theme.map.portals[side][look];
      const sx = 520 + c * 520;
      const sy = 260 + r * 300;
      placeFrame(w, frame, 'ground', sx, sy, { sortY: sy });
      k.label(`${side} ${look}`, sx, sy + 90);
      if (look === 'flare') {
        const center = w.lib.frames[frame]?.attach?.center ?? [0, 0];
        const at = [sx + center[0] * w.unitPx, sy + center[1] * w.unitPx] as const;
        k.tick((dt, t) => {
          if (Math.floor(t / 1000) !== Math.floor((t - dt) / 1000))
            w.fx.mark?.('portal-flare', at[0], at[1], 900);
        });
      }
    });
  });
}
