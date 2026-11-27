// Disguise invariants for the wired round (SPEC §6.11, §6.20, §12.3, §12.9; BUILD_PLAN TF12): over a
// seeded, scripted round through the real runtime (relay fake, match, sim, phone routing), the step a
// grab succeeds, the step a pickpocket hold completes and the step a tip payout lands carry no `tv`
// event that names the thief (or tipper) and play no sound for them; and nothing the TV renders during
// the round (TV views, world views, TV events) contains a player id or name outside hands up and the
// reveal. TF14 extends the pickpocket and tip parts once those systems pay out for real.
import { describe, expect, it } from 'vitest';
import { cuesFor } from '../audio/cues';
import { createRuntime } from '../game';
import { fakeHostClient } from '../net/__tests__/fakeClient';
import { guards as guardsApi } from '../sim/guards';
import { holds } from '../sim/holds';
import type { PhoneEvent, TvEvent } from '../sim/events';
import type { Sim } from '../sim/world';
import type { Character } from '../sim/types';

const PLAYERS = [
  { id: 'pid-aulus-77', name: 'Aulus' },
  { id: 'pid-brutus-88', name: 'Brutus' },
  { id: 'pid-cassia-99', name: 'Cassia' },
] as const;
const [A, B, C] = PLAYERS;

const ENTITY_KEYS = ['by', 'at', 'thief', 'to', 'character', 'guard', 'merchant'] as const;
const names = (e: TvEvent, id: number) =>
  ENTITY_KEYS.some((k) => (e as unknown as Record<string, unknown>)[k] === id);

interface StepRecord {
  tv: TvEvent[];
  phone: PhoneEvent[];
}

function setup() {
  let t = 0;
  const fake = fakeHostClient();
  const rt = createRuntime({ client: fake.client, origin: 'http://tv', seed: 11, now: () => t });
  const steps: StepRecord[] = [];
  rt.onStep((sim) => {
    const tv: TvEvent[] = [];
    const phone: PhoneEvent[] = [];
    for (const e of sim.events()) {
      if (e.ch === 'tv') tv.push(e);
      else phone.push(e);
    }
    steps.push({ tv, phone });
  });
  /** What the TV shows, per tick, with the match phase it was shown in. */
  const shown: { phase: string; json: string }[] = [];
  const held = new Set<string>();
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      t += 16;
      for (const p of PLAYERS)
        fake.msg(p.id, { t: 'input', x: 0, y: 0, bits: held.has(p.id) ? 1 : 0 });
      rt.tick(16);
      const f = rt.frame(16);
      shown.push({
        phase: rt.matchPhase(),
        json: JSON.stringify([rt.tvView(), f?.view ?? null, f?.events ?? []]),
      });
    }
  };
  for (const p of PLAYERS) fake.join(p.id, p.name);
  for (const p of PLAYERS) fake.msg(p.id, { t: 'ready', ready: true });
  expect(rt.start(A.id)).toBe(true);
  tick(Math.ceil(4300 / 16));
  expect(rt.matchPhase()).toBe('play');
  const sim = rt.sim()!;
  const char = (id: string): Character =>
    sim.world.characters.find((c) => c.control.k !== 'npc' && c.control.playerId === id)!;
  const quiet = () => {
    for (const m of sim.world.merchants) {
      m.glance = null;
      m.nextGlanceAt = sim.world.tick + 1_000_000;
    }
    for (const g of sim.world.guards) {
      g.mode = { k: 'rush', target: null };
      g.vx = 0;
      g.vy = 0;
    }
  };
  return { fake, rt, sim, steps, shown, held, tick, char, quiet };
}

/** The steps (index ≥ from) whose phone events include one of these kinds for `player`. */
function stepsWith(steps: StepRecord[], from: number, kind: PhoneEvent['e'], player: string) {
  return steps.slice(from).filter((s) => s.phone.some((e) => e.e === kind && e.player === player));
}

function openSellingStall(sim: Sim) {
  const s = sim.world.stalls.find((x) => x.open && sim.content.shops[x.shop].sells)!;
  const d = sim.content.layout.stalls[s.id]!;
  return { s, at: { x: (d.customer.x0 + d.customer.x1) / 2, y: d.customer.y } };
}

describe('disguise: grab, pickpocket and tip payout stay off the TV', () => {
  it('runs a scripted round with no tell on the TV', () => {
    const { rt, sim, steps, shown, held, tick, char, quiet, fake } = setup();
    quiet();

    // ---- A grabs from a stall counter until it completes ----
    const { s, at } = openSellingStall(sim);
    const a = char(A.id);
    a.x = at.x;
    a.y = at.y;
    fake.msg(A.id, { t: 'browse' });
    tick(3);
    expect(a.activity).toEqual({ k: 'browsing', stall: s.id });
    quiet();
    const slot = s.slots.find((x) => x.row === 'counter' && x.item !== null)!;
    const from = steps.length;
    fake.msg(A.id, { t: 'grab', stall: s.id, slot: slot.slot });
    held.add(A.id);
    tick(Math.ceil(4000 / 16));
    held.delete(A.id);
    const grabbed = stepsWith(steps, from, 'grabbed', A.id);
    expect(grabbed).toHaveLength(1);
    for (const st of grabbed) {
      expect(st.tv.every((e) => e.e === 'stallChanged')).toBe(true);
      expect(st.tv.flatMap(cuesFor)).toEqual([]);
    }
    // The whole grab, start to finish: nothing on the TV names A.
    for (const st of steps.slice(from)) expect(st.tv.filter((e) => names(e, a.id))).toEqual([]);

    // ---- B holds PICKPOCKET behind an NPC until the hold completes (TF14 pays the loot) ----
    quiet();
    const b = char(B.id);
    const victim = sim.world.characters.find((c) => c.control.k === 'npc')!;
    b.x = victim.x;
    b.y = victim.y - 0.5;
    victim.vx = 0;
    victim.vy = 0;
    held.add(B.id);
    tick(1);
    const ppFrom = steps.length;
    expect(holds.armPickpocket(sim.context(), b.id, victim.id)).toBe(true);
    for (let i = 0; i < Math.ceil(2400 / 16); i++) {
      // The victim stands still beside B for the whole hold.
      victim.x = b.x;
      victim.y = b.y + 0.5;
      victim.vx = 0;
      victim.vy = 0;
      tick(1);
    }
    held.delete(B.id);
    const ppEnd = steps
      .slice(ppFrom)
      .filter((st) => st.phone.some((e) => e.e === 'holdEnd' && e.player === B.id));
    expect(ppEnd.length).toBeGreaterThan(0);
    for (const st of steps.slice(ppFrom)) {
      expect(st.tv.filter((e) => names(e, b.id))).toEqual([]);
      expect(st.phone.filter((e) => e.e === 'pickpocketed').length).toBeLessThanOrEqual(1);
    }
    for (const st of stepsWith(steps, ppFrom, 'pickpocketed', B.id))
      expect(st.tv.flatMap(cuesFor)).toEqual([]);

    // ---- C's landed tip: the guard collects B; C's payout is on C's phone only ----
    const c = char(C.id);
    const g = sim.world.guards[0]!;
    g.mode = { k: 'patrol', waypoint: 0 };
    g.x = b.x + 3;
    g.y = b.y;
    const tipFrom = steps.length;
    guardsApi.collect(sim.context(), b.id, C.id);
    tick(Math.ceil(4000 / 16));
    const paid = stepsWith(steps, tipFrom, 'tipPayout', C.id);
    expect(paid).toHaveLength(1);
    for (const st of paid) {
      expect(st.tv.filter((e) => names(e, c.id))).toEqual([]);
      const cues = st.tv.flatMap((e) => cuesFor(e).map((q) => q.at));
      expect(cues).not.toContain(c.id);
    }
    for (const st of steps.slice(tipFrom)) expect(st.tv.filter((e) => names(e, c.id))).toEqual([]);
    // The payout reached C's phone and nobody else's.
    const payout = paid[0]!.phone.find((e) => e.e === 'tipPayout')!;
    const amount = payout.e === 'tipPayout' ? payout.amount : -1;
    const payToasts = fake.sent.filter((m) => {
      const d = m.data as { t: string; amount?: number; kind?: string };
      return d.t === 'toast' && d.kind === 'gain' && d.amount === amount;
    });
    expect(payToasts.map((m) => m.to)).toContain(C.id);
    expect(fake.sent.every((m) => m.to !== undefined)).toBe(true); // never a broadcast

    // ---- hands up and the reveal ----
    rt.endRound();
    tick(Math.ceil(9000 / 16));

    // Nothing the TV showed during the round names a player outside hands up and the reveal.
    const secret = [...PLAYERS.map((p) => p.id), ...PLAYERS.map((p) => p.name)];
    const round = shown.filter((x) => x.phase === 'roundStart' || x.phase === 'play');
    expect(round.length).toBeGreaterThan(100);
    for (const x of round) for (const word of secret) expect(x.json).not.toContain(word);
    for (const x of shown.filter((y) => y.phase === 'handsUp'))
      for (const id of PLAYERS.map((p) => p.id)) expect(x.json).not.toContain(id);
    expect(shown.some((x) => x.phase === 'reveal' && x.json.includes('Aulus'))).toBe(true);
  });
});
