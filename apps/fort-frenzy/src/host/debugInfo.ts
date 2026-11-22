// The debug panel's readouts (SPEC §9.5, RD6): portal activity and the hot side from the sim's spawn
// plan, and each knight's build meter. Pure (no DOM), so the panel and `__pcg` read the same thing.
import type { Content } from '../content';
import { PORTAL_IDS, type BuildId, type PortalId, type SideId } from '../shared/ids';
import { STEP_MS, type World } from './sim/types';

export interface PortalActivity {
  id: PortalId;
  side: SideId;
  /** Groups still to spawn here this wave. */
  queued: number;
  /** Flared, its group not out yet (§9.4: the ~1 s flare). */
  flaring: boolean;
  /** Until its next group spawns, or null with none queued. */
  nextInMs: number | null;
}

export interface HotState {
  /** The hot side of the next pulse still to spawn, or null with nothing queued. */
  hot: SideId | null;
  /** The debug panel's forced hot side, or null. */
  forced: SideId | null;
  portals: PortalActivity[];
}

export function hotState(w: World | null, content: Content, forced: SideId | null): HotState {
  const portals = content.map?.portals;
  const spawns = w?.spawns ?? [];
  const next = spawns.reduce<(typeof spawns)[number] | null>(
    (a, g) => (a === null || g.atTick < a.atTick ? g : a),
    null,
  );
  return {
    hot: next?.hot ?? null,
    forced,
    portals: PORTAL_IDS.map((id) => {
      const mine = spawns.filter((g) => g.portal === id);
      const at = mine.length > 0 ? Math.min(...mine.map((g) => g.atTick)) : null;
      return {
        id,
        side: portals?.[id].side ?? 'bottom',
        queued: mine.length,
        flaring: mine.some((g) => g.flared),
        nextInMs: at === null || !w ? null : Math.max(0, Math.round((at - w.tick) * STEP_MS)),
      };
    }),
  };
}

export interface MeterState {
  slot: number;
  build: BuildId;
  /** 0..1 (§7.2). */
  meter: number;
  full: boolean;
  /** A thrown build's aim is held (the TV draws the throw preview). */
  aiming: boolean;
  /** This knight's builds on the map. */
  active: number;
}

export function meterStates(w: World | null, content: Content): MeterState[] {
  if (!w) return [];
  return w.players.map((p) => ({
    slot: p.slot,
    build: content.knights.find((k) => k.id === p.classId)?.build ?? 'shield_gen',
    meter: p.meter,
    full: p.meter >= 1,
    aiming: p.buildAim !== null,
    active: w.builds.filter((b) => b.owner === p.slot).length,
  }));
}

/** One line for the panel: "hot left (forced) · bottom-w 2 ⚑ 0.8 s · …". */
export function hotLine(h: HotState): string {
  const head = `hot ${h.hot ?? '—'}${h.forced ? ` (forced ${h.forced})` : ''}`;
  const live = h.portals
    .filter((p) => p.queued > 0)
    .map(
      (p) =>
        `${p.id} ${p.queued}${p.flaring ? ' FLARE' : ''}` +
        (p.nextInMs === null ? '' : ` ${(p.nextInMs / 1000).toFixed(1)}s`),
    );
  return [head, ...live].join(' · ');
}
