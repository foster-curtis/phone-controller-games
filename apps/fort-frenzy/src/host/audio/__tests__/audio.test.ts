// SFX player and cues (SPEC §12, BUILD_PLAN FF13).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SFX_IDS } from '../../../shared/ids';
import { cues, playCues } from '../cues';
import { createSfx, TUNING, type AudioLike } from '../index';

const appRoot = join(import.meta.dirname, '..', '..', '..', '..');

function fake() {
  const started: number[] = [];
  const audio: AudioLike = {
    state: 'suspended',
    resume: async () => {},
    decode: async () => ({}),
    start: (_b, v) => void started.push(v),
  };
  return { audio, started };
}

describe('sfx files', () => {
  const lic = JSON.parse(readFileSync(join(appRoot, 'assets', 'LICENSES.json'), 'utf8')) as {
    entries: { path?: string }[];
  };
  it.each(SFX_IDS)('%s has an mp3 and a LICENSES entry', (id) => {
    expect(existsSync(join(appRoot, 'audio', 'neon-knights', `${id}.mp3`))).toBe(true);
    expect(lic.entries.some((e) => e.path === `audio/neon-knights/${id}.mp3`)).toBe(true);
  });
  it('every cue id has a mapping from some event', () => {
    for (const id of SFX_IDS)
      expect(
        cues.some((c) => c.sfx === id),
        id,
      ).toBe(true);
  });
});

describe('player', () => {
  const files = Object.fromEntries(SFX_IDS.map((i) => [i, `/${i}.mp3`]));
  const make = async () => {
    const { audio, started } = fake();
    const sfx = createSfx(files, {
      audio,
      now: () => 1000,
      fetchBytes: async () => new ArrayBuffer(1),
    });
    await sfx.preload();
    sfx.unlock();
    return { sfx, started };
  };

  it('rate-limits a cue fired 20 times in one step to its cap', async () => {
    const { sfx, started } = await make();
    for (let i = 0; i < 20; i++) sfx.play('enemy_hit');
    expect(started.length).toBe(TUNING.enemy_hit.max);
  });

  it('is silent until unlocked and reports preload progress', async () => {
    const { audio, started } = fake();
    const sfx = createSfx(files, { audio, fetchBytes: async () => new ArrayBuffer(1) });
    const seen: number[] = [];
    await sfx.preload((p) => seen.push(p));
    sfx.play('purchase');
    expect(started).toEqual([]);
    expect(seen.at(-1)).toBe(1);
    sfx.unlock();
    expect(sfx.unlocked).toBe(true);
    sfx.play('purchase');
    expect(started.length).toBe(1);
  });
});

describe('cues', () => {
  it('maps events to cue ids', () => {
    const played: string[] = [];
    const kind = (id: number) => (id === 1 ? 'player' : id === 2 ? 'enemy' : 'other');
    playCues(
      [
        { e: 'baseAlarm', on: true },
        { e: 'baseAlarm', on: false },
        { e: 'damage', source: null, target: 1, amount: 1, kind: 'melee', killed: false },
        { e: 'damage', source: null, target: 2, amount: 1, kind: 'melee', killed: false },
        { e: 'runEnd', result: 'defeat', wave: 3 },
      ],
      (id) => played.push(id),
      kind,
    );
    expect(played).toEqual(['base_alarm', 'player_hit', 'enemy_hit', 'defeat']);
  });
});

describe('redesign cues (RD13)', () => {
  const run = (events: Parameters<typeof playCues>[0]) => {
    const played: string[] = [];
    playCues(
      events,
      (id) => played.push(id),
      () => 'other',
    );
    return played;
  };

  it('maps the build, mine, portal, Brute, Charge, slam and Rally Cry events', () => {
    expect(
      run([
        { e: 'mineTrigger', build: 1 },
        { e: 'mineBurst', build: 1 },
        { e: 'buildHit', build: 2, kind: 'shield_gen' },
        { e: 'buildHit', build: 3, kind: 'mine' },
        { e: 'buildHit', build: 3 },
        { e: 'beaconPulse', build: 4 },
        { e: 'portalFlare', portal: 'bottom-w' },
        { e: 'bruteTarget', enemy: 5, build: 2 },
        { e: 'windupLanded', source: 6, slot: 'super' },
        { e: 'windupLanded', source: 6, slot: 'main' },
        { e: 'reinforce', slot: 0, count: 1 },
        { e: 'reinforce', slot: 0, count: 2 },
      ]),
    ).toEqual([
      'mine_trigger',
      'mine_blast',
      'shield_hit',
      'beacon_tick',
      'portal_flare',
      'brute_lock',
      'slam_land',
      'rally_double',
    ]);
  });

  it('plays the Charge wind-up instead of the generic boss marker', () => {
    expect(
      run([
        { e: 'marker', id: 9, source: 1, landsAtTick: 100 },
        { e: 'chargeWindup', source: 1, marker: 9 },
        { e: 'marker', id: 10, source: 1, landsAtTick: 100 },
      ]),
    ).toEqual(['charge_windup', 'boss_windup']);
  });

  it('caps every cue fired 20 times in one step', async () => {
    for (const id of SFX_IDS) {
      const { audio, started } = fake();
      const sfx = createSfx(
        { [id]: '/x.mp3' },
        { audio, now: () => 1000, fetchBytes: async () => new ArrayBuffer(1) },
      );
      await sfx.preload();
      sfx.unlock();
      for (let i = 0; i < 20; i++) sfx.play(id);
      expect(started.length, id).toBe(TUNING[id].max);
      expect(TUNING[id].max, id).toBeLessThanOrEqual(3);
    }
  });
});
