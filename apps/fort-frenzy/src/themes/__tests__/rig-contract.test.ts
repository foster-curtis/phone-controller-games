// The rig contract the renderer relies on (SPEC §2.4, §15.2; art README): views and poses per rig,
// optional groups, attach names, and the clips each rig ships with.
import { describe, expect, it } from 'vitest';
import { neonKnightsHost } from '../neon-knights/host';
import { isPosed, type RigView, type ViewId } from '../types';

const { rigs, clips } = neonKnightsHost;
const KNIGHTS = ['warden', 'ranger', 'commander', 'artificer'];
const SIDE_ONLY = [
  'drone',
  'skitter',
  'brute',
  'bombard',
  'wasp',
  'mite',
  'stalker',
  'colossus',
  'mortar',
];

/** Every part set of a view (posed views: each pose). */
function sets(rig: string, view: ViewId): RigView[] {
  const v = rigs[rig]!.views[view];
  if (!v) return [];
  return isPosed(v) ? Object.values(v.poses) : [v];
}

// Art README "Attach points" table.
const ATTACH: Record<string, string[]> = {
  artificer: ['badge', 'carry', 'lens', 'nametag', 'pack'],
  bombard: ['muzzle', 'top'],
  brute: ['fist', 'top'],
  colossus: [
    'core',
    'eye',
    'fist-far',
    'fist-near',
    'spire-1',
    'spire-2',
    'spire-3',
    'spire-4',
    'spire-5',
    'top',
  ],
  commander: ['badge', 'banner', 'carry', 'nametag', 'sword-tip'],
  drone: ['blade', 'top'],
  footman: ['blade'],
  mite: ['top'],
  mortar: ['muzzle', 'muzzle-iii', 'top'],
  ranger: ['badge', 'bolt', 'carry', 'nametag'],
  skitter: ['core', 'top'],
  stalker: ['eyes', 'top'],
  warden: ['badge', 'carry', 'hammer', 'nametag'],
  wasp: ['muzzle', 'top'],
};

describe('rig contract (neon knights)', () => {
  it('has the 14 rigs', () => {
    expect(Object.keys(rigs).sort()).toEqual([...KNIGHTS, 'footman', ...SIDE_ONLY].sort());
  });

  it('gives knights and the footman side, front and back views', () => {
    for (const r of [...KNIGHTS, 'footman']) {
      expect(Object.keys(rigs[r]!.views).sort(), r).toEqual(['back', 'front', 'side']);
    }
  });

  it('gives the Ranger stand and ready poses in every view, stand by default', () => {
    for (const view of ['side', 'front', 'back'] as const) {
      const v = rigs.ranger!.views[view]!;
      expect(isPosed(v), view).toBe(true);
      if (isPosed(v)) {
        expect(Object.keys(v.poses).sort()).toEqual(['ready', 'stand']);
        expect(v.defaultPose).toBe('stand');
      }
    }
    for (const r of ['warden', 'commander', 'artificer', 'footman', ...SIDE_ONLY]) {
      for (const v of Object.values(rigs[r]!.views)) expect(isPosed(v!), r).toBe(false);
    }
  });

  it('gives enemies, the Colossus and the mortar the side view only (back views are v2)', () => {
    for (const r of SIDE_ONLY) expect(Object.keys(rigs[r]!.views), r).toEqual(['side']);
  });

  it('declares the optional groups code switches', () => {
    expect(Object.keys(rigs.commander!.optional ?? {})).toEqual(['banner']);
    expect(Object.keys(rigs.artificer!.optional ?? {}).sort()).toEqual([
      'core1-full',
      'core1-half',
      'core2-full',
      'core2-half',
      'core3-full',
      'core3-half',
    ]);
    expect(Object.keys(rigs.colossus!.optional ?? {}).sort()).toEqual(['final', 'mk2', 'mk3']);
    expect(Object.keys(rigs.mortar!.optional ?? {}).sort()).toEqual([
      'band1',
      'band2',
      'band3',
      'damaged',
      'ii',
      'iii',
    ]);
    for (const r of [
      'warden',
      'ranger',
      'footman',
      'drone',
      'skitter',
      'brute',
      'bombard',
      'wasp',
      'mite',
      'stalker',
    ])
      expect(Object.keys(rigs[r]!.optional ?? {}), r).toEqual([]);
  });

  it('every optional part exists in some view, and every view lists every part in order', () => {
    for (const [id, rig] of Object.entries(rigs)) {
      const all = new Set<string>();
      for (const view of Object.keys(rig.views) as ViewId[]) {
        for (const rv of sets(id, view)) {
          Object.keys(rv.parts).forEach((p) => all.add(p));
          expect([...rv.order].sort(), `${id} ${view}`).toEqual(Object.keys(rv.parts).sort());
          for (const p of Object.values(rv.parts))
            if (p.parent) expect(rv.parts[p.parent], `${id} ${p.frame}`).toBeDefined();
        }
      }
      for (const parts of Object.values(rig.optional ?? {}))
        for (const p of parts) expect(all.has(p), `${id} ${p}`).toBe(true);
    }
  });

  it('carries the art README attach names in every view and pose', () => {
    for (const [id, names] of Object.entries(ATTACH)) {
      for (const view of Object.keys(rigs[id]!.views) as ViewId[]) {
        for (const rv of sets(id, view)) {
          expect(Object.keys(rv.attach ?? {}).sort(), `${id} ${view}`).toEqual([...names].sort());
          for (const a of Object.values(rv.attach ?? {}))
            expect(rv.parts[a.part], `${id} ${view}`).toBeDefined();
        }
      }
    }
  });

  it('marks tint and emissive parts as the art README says', () => {
    for (const k of KNIGHTS) {
      for (const view of Object.keys(rigs[k]!.views) as ViewId[]) {
        for (const rv of sets(k, view)) {
          expect(
            Object.values(rv.parts).some((p) => p.tint === 'player'),
            `${k} ${view}`,
          ).toBe(true);
          for (const [name, p] of Object.entries(rv.parts)) {
            // `<host>-glow` pieces (the Artificer's gauge cores are emissive too, but stand alone).
            if (name.endsWith('-glow')) {
              expect(p.emissive, `${k} ${name}`).toBe(true);
              // Parented to its host and drawn after it (right after, or after the host's own
              // child, like the Commander's banner cloth).
              expect(p.parent, `${k} ${view} ${name}`).toBeDefined();
              const gap = rv.order.indexOf(name) - rv.order.indexOf(p.parent!);
              expect(gap, `${k} ${view} ${name}`).toBeGreaterThan(0);
              expect(gap, `${k} ${view} ${name}`).toBeLessThanOrEqual(2);
            }
          }
        }
      }
    }
  });

  it('ships idle and walk for every walking rig, idle for the mortar, and the knights’ shared clips', () => {
    for (const r of Object.keys(rigs)) {
      expect(clips[`${r}/idle`], r).toBeDefined();
      if (r !== 'mortar') expect(clips[`${r}/walk`], r).toBeDefined();
    }
    for (const k of KNIGHTS) {
      for (const c of ['hit', 'down', 'respawn'])
        expect(clips[`${k}/${c}`], `${k}/${c}`).toBeDefined();
    }
    expect(clips['colossus/walk']!.tracks.torso!.some((k) => k.order)).toBe(true);
  });

  it('clip tracks only name parts the rig has', () => {
    for (const [key, clip] of Object.entries(clips)) {
      const rig = rigs[key.split('/')[0]!]!;
      const parts = new Set<string>();
      for (const v of Object.values(rig.views)) {
        for (const rv of isPosed(v!) ? Object.values(v.poses) : [v!])
          Object.keys(rv.parts).forEach((p) => parts.add(p));
      }
      for (const part of Object.keys(clip.tracks))
        expect(parts.has(part), `${key}: ${part}`).toBe(true);
      for (const keys of Object.values(clip.tracks))
        for (const k of keys)
          if (k.order)
            for (const p of k.order) expect(parts.has(p), `${key} order ${p}`).toBe(true);
    }
  });
});
