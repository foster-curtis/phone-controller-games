// Vertical-slice hook group (BUILD_PLAN TF12; e2e `tf12-slice.spec.ts`): the match phase, the round's
// TV event log and ledger, ending the play timer, and placing characters and guards, quieting the
// merchants or forcing one glance, so e2e can stage each slice beat on real phones. Debug only: these
// name players and move characters, so nothing outside `?debug=1` may reach them (SPEC §6.11).
import type { HookGroup } from '../debug';
import type { Character, Guard, World } from '../sim/types';
import { STEP_MS } from '../sim/types';

type At = { x: number; y: number };

/** A staged beat that fires on the step a player's steal hold starts. */
type OnHold =
  | { player: string; k: 'glance'; stall: number; windupMs: number }
  | { player: string; k: 'guard'; i: number; x: number; y: number; facing: number };

const slice: HookGroup = (rt, register) => {
  let pending: OnHold[] = [];
  const world = (): World | null => rt.sim()?.world ?? null;
  const ticks = (ms: number) => Math.round(ms / STEP_MS);
  const charOf = (player: string): Character | null => {
    const id = rt.characterOf(player);
    return world()?.characters.find((c) => c.id === id) ?? null;
  };
  const stand = (b: Character | Guard, at: At, facing?: number) => {
    b.x = at.x;
    b.y = at.y;
    b.vx = 0;
    b.vy = 0;
    if (facing !== undefined) b.facing = facing;
  };

  register('matchPhase', () => rt.matchPhase());
  register('endRound', () => rt.endRound());
  register('tvLog', () => rt.tvLog().map((e) => ({ ...e })));
  register('tvView', () => rt.tvView());
  register('bag', (player: string) => {
    const c = charOf(player);
    const acc = c?.side ? rt.ledger()?.account(c.side) : null;
    return acc ? { purse: acc.purse, items: acc.pack.map((e) => e.item) } : null;
  });
  register('character', (player: string) => {
    const c = charOf(player);
    return c ? { id: c.id, x: c.x, y: c.y, facing: c.facing, activity: c.activity.k } : null;
  });
  /** Open selling stalls with the middle of their customer line (where BROWSE applies). */
  register('stalls', () => {
    const w = world();
    const sim = rt.sim();
    if (!w || !sim) return [];
    return w.stalls
      .filter((s) => s.open && sim.content.shops[s.shop].sells)
      .map((s) => {
        const d = sim.content.layout.stalls[s.id]!;
        return {
          id: s.id,
          shop: s.shop,
          lane: d.lane,
          x: (d.customer.x0 + d.customer.x1) / 2,
          y: d.customer.y,
        };
      });
  });
  /** Moves a player's character (and turns it, radians). Its activity is kept. */
  register('place', (player: string, x: number, y: number, facing?: number) => {
    const c = charOf(player);
    if (c) stand(c, { x, y }, facing);
    return c !== null;
  });
  /** Moves NPCs within `r` tiles of (x, y) out of the way (a clear spot for a staged catch). */
  register('shoo', (x: number, y: number, r: number) => {
    for (const c of world()?.characters ?? []) {
      if (c.control.k !== 'npc' || Math.hypot(c.x - x, c.y - y) > r) continue;
      stand(c, { x: c.x, y: c.y + (c.y > y ? r : -r) });
    }
  });
  register('guards', () =>
    (world()?.guards ?? []).map((g) => ({
      id: g.id,
      x: g.x,
      y: g.y,
      mode: g.mode.k,
      thief: 'thief' in g.mode ? g.mode.thief : null,
    })),
  );
  /** Every guard stands still off duty (no patrol, no spotting, no answering alerts). */
  register('parkGuards', () => {
    for (const g of world()?.guards ?? []) {
      g.mode = { k: 'rush', target: null };
      g.alert = false;
      stand(g, { x: g.x, y: g.y });
    }
  });
  /** Puts guard `i` on patrol at (x, y), facing `facing`. */
  register('placeGuard', (i: number, x: number, y: number, facing: number) => {
    const w = world();
    const g = w?.guards[i];
    if (!w || !g) return false;
    stand(g, { x, y }, facing);
    g.mode = { k: 'patrol', waypoint: 0 };
    g.alert = false;
    return true;
  });
  /** No merchant glances for `ms` (sim time). */
  register('calmMerchants', (ms: number) => {
    const w = world();
    if (!w) return;
    for (const m of w.merchants) {
      m.glance = null;
      m.nextGlanceAt = w.tick + ticks(ms);
    }
  });
  /**
   * When `player` next starts a steal hold, that stall's merchant glances (a `windupMs` wind-up, then
   * the look, which catches the live grab: SPEC §6.6). Deterministic, unlike racing a real hold.
   */
  register('glanceOnHold', (player: string, stall: number, windupMs: number) => {
    pending.push({ player, k: 'glance', stall, windupMs });
  });
  /** When `player` next starts a steal hold, guard `i` appears on patrol at (x, y), facing `facing`. */
  register('guardOnHold', (player: string, i: number, x: number, y: number, facing: number) => {
    pending.push({ player, k: 'guard', i, x, y, facing });
  });
  rt.onStep((sim) => {
    if (pending.length === 0) return;
    const w = sim.world;
    pending = pending.filter((p) => {
      const c = charOf(p.player);
      if (!c || !w.holds.some((h) => h.actor === c.id && h.result === null)) return true;
      if (p.k === 'glance') {
        const m = w.merchants.find((x) => x.stall === p.stall);
        if (m) m.glance = { stage: 'windup', at: null, until: w.tick + ticks(p.windupMs) };
      } else {
        const g = w.guards[p.i];
        if (g) {
          stand(g, { x: p.x, y: p.y }, p.facing);
          g.mode = { k: 'patrol', waypoint: 0 };
          g.alert = false;
        }
      }
      return false;
    });
  });
  /**
   * That stall's merchant glances now: a wind-up of `windupMs` (sim ms; default the balance value),
   * then the look, which catches any live grab at his stall (SPEC §6.6). He must be behind his counter.
   */
  register('forceGlance', (stall: number, windupMs?: number) => {
    const w = world();
    const sim = rt.sim();
    const m = w?.merchants.find((x) => x.stall === stall);
    if (!w || !sim || !m || m.spot !== 'counter' || m.shouting) return false;
    const ms = windupMs ?? sim.content.balance.merchants.windupMs;
    m.glance = { stage: 'windup', at: null, until: w.tick + ticks(ms) };
    return true;
  });
};

export default slice;
