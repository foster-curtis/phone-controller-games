// Phone views for the support classes (SPEC §10.1 rows 3, 6, 7; Give for classes with no
// structures): the action icon, and Give on hold that repeats every 300 ms end to end (the phone's
// arc → the kit's radial gesture → the sim's Give).
import { RADIAL_DEFAULTS, radialGesture, SLOT_DOWN } from '@pcg/controller-kit';
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import type { ClassId, PlayerColorId } from '../../../shared/ids';
import { PLAYER_COLOR_IDS } from '../../../shared/ids';
import { createSim, ScriptedInputSource } from '../../sim';
import { actionFor, meView, type FfMember, type FfParty, type ViewCtx } from '../views';

function run(classes: ClassId[]) {
  const pads = classes.map(() => new ScriptedInputSource());
  const sim = createSim(
    {
      seed: 3,
      settings: { theme: 'neon-knights', difficulty: 'normal' },
      slots: classes.map((classId, i) => ({
        slot: i,
        name: `P${i}`,
        color: PLAYER_COLOR_IDS[i] as PlayerColorId,
        classId,
        connected: true,
      })),
    },
    { sources: new Map(pads.map((p, i) => [i, p] as const)) },
  );
  const until = (pred: () => boolean) => {
    for (let i = 0; i < 6000 && !pred(); i++) sim.step();
  };
  until(() => sim.world.phase === 'build');
  const p = (slot: number) => sim.world.players.find((x) => x.slot === slot)!;
  return { sim, pads, p, until };
}

function combat(classes: ClassId[]) {
  const r = run(classes);
  for (const q of r.sim.world.players) r.sim.command({ c: 'ready', slot: q.slot, ready: true });
  r.until(() => r.sim.world.phase === 'combat');
  for (const g of r.sim.world.spawns) g.atTick += 1e7;
  return r;
}

/** A minimal party view of the run's players (meView reads only these). */
function ctxOf(world: ViewCtx['world'], classes: ClassId[]): { ctx: ViewCtx; m: FfMember[] } {
  const m = classes.map(
    (classId, i) =>
      ({
        playerId: `p${i}`,
        name: `P${i}`,
        color: PLAYER_COLOR_IDS[i],
        classId,
        ready: false,
        connected: true,
        slot: i,
      }) as unknown as FfMember,
  );
  const party = {
    members: m,
    leaderId: 'p0',
    isLeader: (id: string) => id === 'p0',
    screen: () => 'run',
  } as unknown as FfParty;
  return {
    ctx: {
      party,
      content,
      settings: { theme: 'neon-knights', difficulty: 'normal' },
      world,
      summary: null,
    },
    m,
  };
}

describe('action icon (§10.1 rows 3, 6, 7)', () => {
  it('kit in the repair zone, throw at an Engineer in reach, flag then recall', () => {
    const r = combat(['quartermaster', 'engineer', 'commander']);
    const w = r.sim.world;
    const qm = r.p(0);
    // Row 3: a kit, the base hurt, in the repair zone.
    w.base.hp = w.base.maxHp - 100;
    qm.kits = 1;
    qm.x = 18;
    qm.y = 2.5;
    expect(actionFor(content, w, qm)).toBe('kit');
    w.base.hp = w.base.maxHp;
    expect(actionFor(content, w, qm)).toBe('none');
    // Row 6: crates and an Engineer in reach.
    qm.x = 10;
    qm.y = 10;
    qm.crates = 2;
    r.p(1).x = 13;
    r.p(1).y = 10;
    expect(actionFor(content, w, qm)).toBe('throw');
    r.p(1).x = 30;
    expect(actionFor(content, w, qm)).toBe('none');
    // Row 7.
    const cmd = r.p(2);
    cmd.x = 8;
    cmd.y = 14;
    expect(actionFor(content, w, cmd)).toBe('flag');
    r.pads[2]!.tap('actionTaps');
    r.sim.step();
    expect(actionFor(content, w, cmd)).toBe('recall');
  });

  it('build phase: no throw or flag (rows 1–4 only)', () => {
    const r = run(['quartermaster', 'engineer', 'commander']);
    const qm = r.p(0);
    qm.x = 10;
    qm.y = 10;
    qm.crates = 2;
    r.p(1).x = 12;
    r.p(1).y = 10;
    expect(actionFor(content, r.sim.world, qm)).toBe('none');
    expect(actionFor(content, r.sim.world, r.p(2))).toBe('none');
  });
});

describe('Give on hold for the Quartermaster and Commander (§10.1)', () => {
  for (const cls of ['quartermaster', 'commander'] as const) {
    it(`${cls}: the arc is Give alone, and holding gives a crate every 300 ms`, () => {
      const r = combat([cls, 'engineer']);
      const giver = r.p(0);
      giver.x = 10;
      giver.y = 10;
      giver.crates = 4;
      r.p(1).x = 11;
      r.p(1).y = 10;
      const { ctx, m } = ctxOf(r.sim.world, [cls, 'engineer']);
      const me = meView(ctx, m[0]!);
      expect(me.arc!.slots).toEqual([null, null, null, 'give']);
      expect(me.arc!.enabled).toEqual([false, false, false, true]);

      // The phone's radial with that arc: hold 0.4 s, then a repeat every 300 ms until release.
      const slots = me.arc!.slots.map((s, i) => (s === null ? null : me.arc!.enabled[i]!));
      const g = radialGesture({ ...RADIAL_DEFAULTS, slots });
      let st = g.initial();
      const commits: number[] = [];
      for (const i of [
        { type: 'down', t: 0 },
        { type: 'tick', t: 400 },
        { type: 'tick', t: 700 },
        { type: 'tick', t: 1000 },
        { type: 'up', t: 1100 },
      ] as const) {
        const out = g.step(st, i);
        st = out.state;
        for (const o of out.out) if (o.kind === 'commit' && o.slot === SLOT_DOWN) commits.push(i.t);
      }
      expect(commits).toEqual([400, 700, 1000]);

      // Each commit reaches the sim as a radial commit on slot down: one crate handed over each.
      for (const _ of commits) {
        r.pads[0]!.tap('radialCommits', { radialSlot: 3 });
        r.sim.step();
        r.sim.step();
      }
      expect(giver.crates).toBe(1);
      expect(r.p(1).crates).toBe(3);
    });
  }
});
