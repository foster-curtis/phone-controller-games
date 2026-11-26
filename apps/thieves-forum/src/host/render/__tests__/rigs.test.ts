// Rig and clip contract (SPEC §12.2, §6.21, §6.11; BUILD_PLAN TF1): every rig has every part in
// every view and pose, every clip names only existing parts, clip poses and groups exist, and the
// citizen rig and clip set serve any outfit (no player-only clip exists).
import { describe, expect, it } from 'vitest';
import { balance } from '../../../content';
import { theme } from '../../../shared/theme';
import type { PoseId } from '../../sim/types';
import { MANIFEST, RIGS } from '../assets';
import { CLIPS, CLIPS_BY_RIG, clipNames } from '../clips/index';
import { HAIR_TONES, SKIN_TONES, outfitTints } from '../tones';
import { RIG_IDS, VIEW_IDS, rigFrameName, type RigDef, type RigPose, type ViewId } from '../types';

const poses = (rig: RigDef): [string, string, RigPose][] =>
  VIEW_IDS.flatMap((v) =>
    Object.entries(rig.views[v].poses).map(([p, rp]) => [v, p, rp] as [string, string, RigPose]),
  );

const partsOf = (rig: RigDef) => new Set(poses(rig).flatMap(([, , rp]) => Object.keys(rp.parts)));

describe('rigs', () => {
  it('ships citizen, merchant and guard with front, side and back views', () => {
    expect(Object.keys(RIGS).sort()).toEqual([...RIG_IDS].sort());
    expect([...MANIFEST.rigs].sort()).toEqual([...RIG_IDS].sort());
    for (const rig of Object.values(RIGS))
      expect(Object.keys(rig.views).sort(), rig.id).toEqual([...VIEW_IDS].sort());
  });

  it('every rig has every part in every view and pose (hidden ones listed), in order', () => {
    for (const rig of Object.values(RIGS)) {
      const optional = new Set(Object.values(rig.optional ?? {}).flat());
      const all = partsOf(rig);
      for (const [view, pose, rp] of poses(rig)) {
        for (const part of all)
          if (!optional.has(part))
            expect(rp.parts[part], `${rig.id} ${view}/${pose} ${part}`).toBeDefined();
        expect([...rp.order].sort(), `${rig.id} ${view}/${pose}`).toEqual(
          Object.keys(rp.parts).sort(),
        );
      }
    }
  });

  it('every drawn part has its frame in the manifest; hidden parts have none', () => {
    for (const rig of Object.values(RIGS)) {
      for (const [view, pose, rp] of poses(rig)) {
        for (const [name, part] of Object.entries(rp.parts)) {
          const frame = MANIFEST.frames[rigFrameName(rig.id, view as never, pose, name)];
          if (part.src)
            expect(frame?.layers.length, `${rig.id} ${view}/${pose} ${name}`).toBeGreaterThan(0);
          else expect(frame, `${rig.id} ${view}/${pose} ${name}`).toBeUndefined();
        }
      }
    }
  });

  it('carries hand, head-top and feet attach points in every view and pose', () => {
    for (const rig of Object.values(RIGS))
      for (const [view, pose, rp] of poses(rig))
        expect(Object.keys(rp.attach).sort(), `${rig.id} ${view}/${pose}`).toEqual([
          'feet',
          'hand',
          'head-top',
        ]);
  });

  it('citizen tint slots are only the outfit pieces (tunic, mantle, hair, skin)', () => {
    const slots = new Set(
      Object.values(MANIFEST.frames)
        .filter((f) => f.rig?.id === 'citizen')
        .flatMap((f) => f.layers.map((l) => l.tint))
        .filter((t) => t !== null),
    );
    expect([...slots].sort()).toEqual(['hair', 'mantle', 'skin', 'tunic']);
  });
});

describe('clips', () => {
  it('every clip names only parts its rig has', () => {
    for (const [key, clip] of Object.entries(CLIPS)) {
      const rig = RIGS[key.split('/')[0] as keyof typeof RIGS];
      const parts = partsOf(rig);
      for (const part of Object.keys(clip.tracks))
        expect(parts.has(part), `${key}: ${part}`).toBe(true);
    }
  });

  it('clip poses, groups and view variants exist on the rig', () => {
    for (const [key, clip] of Object.entries(CLIPS)) {
      const [rigId, name] = key.split('/') as [keyof typeof RIGS, string];
      const rig = RIGS[rigId];
      const view = name.split('@')[1];
      if (view) expect(VIEW_IDS as readonly string[], key).toContain(view);
      if (clip.pose) {
        const views = (view ? [view] : VIEW_IDS) as readonly ViewId[];
        expect(
          views.some((v) => rig.views[v].poses[clip.pose!]),
          key,
        ).toBe(true);
      }
      for (const g of clip.groups ?? []) expect(rig.optional?.[g], key).toBeDefined();
      for (const keys of Object.values(clip.tracks))
        for (const k of keys) expect(k.t, key).toBeLessThanOrEqual(clip.durationMs);
    }
  });

  it('ships every SPEC §6.21 pose as a clip', () => {
    const want: Record<keyof typeof CLIPS_BY_RIG, PoseId[] | string[]> = {
      citizen: [
        'idle',
        'walk',
        'browse',
        'pickpocket',
        'throw',
        'point',
        'handsUp',
        'run',
        'stocks',
        'caught',
      ],
      merchant: [
        'idle',
        'walk',
        'glanceWindup',
        'glanceLook',
        'glanceBack',
        'fetch',
        'carry',
        'point',
      ],
      guard: ['idle', 'patrol', 'jog', 'catch', 'march'],
    };
    for (const [rig, names] of Object.entries(want))
      expect(clipNames(rig as keyof typeof CLIPS_BY_RIG).sort(), rig).toEqual([...names].sort());
  });

  it('browse and reach/grab are one clip: no separate grab or steal clip exists (SPEC §6.7)', () => {
    for (const key of Object.keys(CLIPS)) expect(key).not.toMatch(/grab|steal|reach/i);
  });
});

describe('outfits (SPEC §6.11)', () => {
  it('the citizen clip set is keyed by rig only: nothing player-specific', () => {
    for (const key of Object.keys(CLIPS)) expect(key).not.toMatch(/player|npc|thief/i);
    expect(Object.keys(CLIPS_BY_RIG).sort()).toEqual([...RIG_IDS].sort());
  });

  it('every outfit in the shared pool maps to fabric and tone colors only', () => {
    const fabrics = new Set<number>(Object.values(theme.fabric).map((c) => c.num));
    const pool = balance.outfit;
    for (const tunic of pool.tunics)
      for (const mantle of pool.mantles)
        for (let hair = 0; hair < pool.hairTones; hair++)
          for (let skin = 0; skin < pool.skinTones; skin++) {
            const t = outfitTints({ tunic, mantle, hair, skin });
            expect(Object.keys(t).sort()).toEqual(['hair', 'mantle', 'skin', 'tunic']);
            expect(fabrics.has(t.tunic!) && fabrics.has(t.mantle!)).toBe(true);
            expect(HAIR_TONES).toContain(t.hair);
            expect(SKIN_TONES).toContain(t.skin);
          }
    expect(HAIR_TONES.length).toBeGreaterThanOrEqual(pool.hairTones);
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(pool.skinTones);
  });
});
