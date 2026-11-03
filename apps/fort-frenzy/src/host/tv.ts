// The `TvView` adapter (SPEC §2.6, §15.2): what the TV's DOM overlay draws, built from the runtime's
// room, the session (party, team view, sim) and the run's transient UI (lane warnings,
// announcements). Pure: the runtime passes everything in.
import type { QrMatrix } from '@pcg/game-kit';
import type { LaneId } from '../shared/ids';
import type { Announcement, HomeRow, TvPlayer, TvScreen, TvView } from './ui/types';
import { newEnemies, teamView, type ViewCtx } from './net/views';
import { STEP_MS } from './sim/types';

export interface TvInput {
  ctx: ViewCtx;
  /** Atlas load progress (0..1) while loading, null once ready. */
  loading: number | null;
  home: { rows: HomeRow[]; focus: number };
  room: { code: string; joinUrl: string; qr: QrMatrix | null } | null;
  announcements: Announcement[];
  /** Lane → the tick its group spawns (the warning glows until then). */
  laneWarnings: ReadonlyMap<LaneId, number>;
  outdated: boolean;
}

export function tvScreen(input: Pick<TvInput, 'ctx' | 'loading' | 'room'>): TvScreen {
  const w = input.ctx.world;
  if (input.loading !== null) return 'loading';
  if (!input.room) return 'home';
  if (!w) return 'lobby';
  switch (w.phase) {
    case 'countdown':
      return 'countdown';
    default:
      return w.phase;
  }
}

export function buildTvView(input: TvInput): TvView {
  const { ctx } = input;
  const w = ctx.world;
  const screen = tvScreen(input);
  const team = input.room ? teamView(ctx) : null;
  const tvPlayer = (playerId: string): TvPlayer | null => {
    const r = team?.roster.find((p) => p.playerId === playerId);
    return r ? { playerId: r.playerId, name: r.name, color: r.color } : null;
  };
  const wishlist: TvView['wishlist'] = [];
  for (const item of new Set(team?.wishlist.map((x) => x.item) ?? [])) {
    const row = team?.shop.find((s) => s.id === item);
    wishlist.push({
      item,
      tier: row?.tier ?? 0,
      price: row?.price ?? null,
      by: (team?.wishlist ?? [])
        .filter((x) => x.item === item)
        .map((x) => tvPlayer(x.by))
        .filter((p): p is TvPlayer => p !== null),
    });
  }
  const lanes: LaneId[] = [];
  if (w) for (const [lane, at] of input.laneWarnings) if (w.tick < at) lanes.push(lane);
  return {
    screen,
    team,
    home:
      screen === 'home' || screen === 'loading'
        ? { rows: input.home.rows, focus: input.home.focus, loading: input.loading ?? 1 }
        : null,
    room: input.room,
    countdownMs:
      w && w.phase === 'countdown' && w.phaseEndsAt !== null
        ? Math.max(0, (w.phaseEndsAt - w.tick) * STEP_MS)
        : null,
    bossBar: null,
    announcements: input.announcements,
    laneWarnings: lanes,
    lowHpAlarm: !!w && w.base.alarm && w.phase === 'combat',
    wishlist: w?.phase === 'build' ? wishlist : [],
    readyStatus:
      w?.phase === 'build' && team
        ? team.roster
            .filter((r) => ctx.party.member(r.playerId)?.slot != null)
            .map((r) => ({
              playerId: r.playerId,
              name: r.name,
              color: r.color,
              ready: r.ready,
              connected: r.connected,
            }))
        : [],
    nextWaveNew: w ? newEnemies(ctx.content, w.wave) : [],
    outdatedBanner: input.outdated,
  };
}
