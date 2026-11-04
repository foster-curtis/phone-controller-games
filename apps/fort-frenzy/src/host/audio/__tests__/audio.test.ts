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
