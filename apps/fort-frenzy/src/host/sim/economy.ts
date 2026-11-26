// The economy run (SPEC §6, §6.2; RD11): a whole run on autopilot with a team that saves, to check
// the coin curve against the shop's prices. Every slot is on autopilot and invincible (as the soak);
// the Citadel takes its damage, so repair has a use. Each build phase the team repairs below
// `repairBelow` of max HP, then buys the next item of `plan` whenever it can afford it, saving for it
// otherwise. A report and a test, never a gate on its own: the numbers tune `rules.coinRate` and the
// prices in `balance.ts`.
import type { Content } from '../../content';
import type { ClassId, ShopItemId } from '../../shared/ids';
import { itemState } from './shop';
import { createSim } from './sim';
import { soakStart } from './soak';
import { AutopilotInputSource } from './sources';

/** What the saving team wants, in order (a tier each time an id appears). */
export const ECONOMY_PLAN: readonly ShopItemId[] = [
  'archer_damage',
  'base_hp',
  'archer_range',
  'base_armor',
  'base_hp',
  'archer_third',
  'base_armor',
  'base_hp',
  'base_armor',
];

/** The team per player count the economy runs use (RD11-fix-1: 1, 2, 3, 4 and 6 players). */
export const ECONOMY_TEAMS: Readonly<Record<number, readonly ClassId[]>> = {
  1: ['warden'],
  2: ['ranger', 'artificer'],
  3: ['warden', 'ranger', 'artificer'],
  4: ['warden', 'ranger', 'artificer', 'commander'],
  6: ['ranger', 'warden', 'artificer', 'commander', 'ranger', 'warden'],
};

export interface EconomyWave {
  /** The build phase before this wave. */
  wave: number;
  /** Team coins when the build phase opened (whole coins, as the phones show). */
  coins: number;
  bought: ShopItemId[];
}

export interface EconomyResult {
  classes: ClassId[];
  waves: EconomyWave[];
  purchases: number;
  result: 'victory' | 'defeat' | null;
}

export interface EconomyOptions {
  seed: number;
  classes: readonly ClassId[];
  content?: Content;
  /** Repair first while the base is below this fraction of its max HP (default 0.75). */
  repairBelow?: number;
}

const RUN_CAP = 60 * 60 * 60;

export function economyRun(opts: EconomyOptions): EconomyResult {
  const classes = [...opts.classes];
  const sim = createSim(soakStart(opts.seed, classes), { content: opts.content });
  for (let slot = 0; slot < classes.length; slot++)
    sim.setSource(slot, new AutopilotInputSource(() => sim.world, slot, sim.content));
  sim.command({ c: 'debug', slot: -1, action: 'invincible', on: true });
  const repairBelow = opts.repairBelow ?? 0.75;
  const w = sim.world;
  const waves: EconomyWave[] = [];
  let next = 0;
  let result: EconomyResult['result'] = null;
  let buildStart = -1;
  const affordable = (item: ShopItemId): boolean => {
    const def = sim.content.shop.find((x) => x.id === item);
    if (!def) return false;
    const st = itemState(sim.content, w, def);
    return st.price !== null && w.team.coins >= st.price;
  };
  for (let i = 0; i < RUN_CAP && w.phase !== 'summary'; i++) {
    if (w.phase === 'build') {
      if (buildStart < 0) {
        buildStart = w.tick;
        waves.push({ wave: w.wave, coins: Math.floor(w.team.coins), bought: [] });
      }
      const at = w.tick - buildStart;
      if (at === 30)
        for (const p of w.players)
          if (p.offer && p.offer.length > 0 && p.picked === null)
            sim.command({ c: 'card', slot: p.slot, card: p.offer[0]! });
      // One buy a step (commands apply on the next step), so each sees the coins the last one left.
      if (at >= 60 && at < 120) {
        const fix = w.base.hp < w.base.maxHp * repairBelow && affordable('repair');
        const want = ECONOMY_PLAN[next];
        if (fix) sim.command({ c: 'buy', slot: 0, item: 'repair' });
        else if (want && affordable(want)) sim.command({ c: 'buy', slot: 0, item: want });
      }
      if (at > 120)
        for (const p of w.players)
          if (!p.ready) sim.command({ c: 'ready', slot: p.slot, ready: true });
    } else {
      buildStart = -1;
    }
    sim.step();
    for (const ev of w.events) {
      if (ev.e === 'runEnd') result = ev.result;
      else if (ev.e === 'purchase') {
        waves[waves.length - 1]?.bought.push(ev.item);
        if (ev.item === ECONOMY_PLAN[next]) next++;
      }
    }
  }
  return {
    classes,
    waves,
    purchases: waves.reduce((n, x) => n + x.bought.length, 0),
    result,
  };
}

/** One line per build phase: "w3 12c repair", for the logs. */
export function economyLines(r: EconomyResult): string[] {
  return r.waves.map(
    (x) => `w${x.wave} ${String(x.coins).padStart(3)}c ${x.bought.join(', ') || '—'}`,
  );
}
