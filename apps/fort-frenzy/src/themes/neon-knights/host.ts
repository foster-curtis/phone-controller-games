// Neon knights theme, TV only (SPEC §15.4 ThemeHost): the packed atlases (1× and 2×), the rigs, the
// clips from src/host/render/clips/<rig>.ts (found by glob, BUILD_PLAN §3), the rig map from
// internal ids to the theme's rigs and the map frames.
import { atlasFiles } from '../../../generated/keys';
import { fk } from '../../host/render/keys';
import type { ClassId, EnemyId } from '../../shared/ids';
import type { AtlasRef, Clip, RigDef, ThemeHost } from '../types';
import { CLASS_RIG } from './shared';

const atlasUrls = import.meta.glob<string>('../../../generated/atlases/*.{png,json}', {
  query: '?url',
  import: 'default',
  eager: true,
});

const rigJson = import.meta.glob<RigDef>('../../../art/neon-knights/rigs/*.json', {
  import: 'default',
  eager: true,
});

const clipModules = import.meta.glob<Record<string, Clip>>('../../host/render/clips/*.ts', {
  import: 'clips',
  eager: true,
});

const sfxUrls = import.meta.glob<string>('../../../audio/neon-knights/*.mp3', {
  query: '?url',
  import: 'default',
  eager: true,
});

const url = (path: string) => atlasUrls[`../../../generated/${path}`] ?? '';

const atlases: AtlasRef[] = atlasFiles
  .filter((a) => a.theme === 'neon-knights')
  .map((a) => ({ key: a.key, json: url(a.json), image: url(a.image), scale: a.scale }));

const rigs: Record<string, RigDef> = {};
for (const rig of Object.values(rigJson)) rigs[rig.id] = rig;

const clips: Record<string, Clip> = {};
for (const [path, byName] of Object.entries(clipModules)) {
  const rig = /([^/]+)\.ts$/.exec(path)![1]!;
  for (const [name, clip] of Object.entries(byName)) clips[`${rig}/${name}`] = clip;
}

export const neonKnightsHost: ThemeHost = {
  atlases,
  rigs,
  clips,
  rigFor: {
    class: CLASS_RIG satisfies Record<ClassId, string>,
    enemy: {
      grunt: 'drone',
      runner: 'skitter',
      swarm: 'mite',
      brute: 'brute',
      flyer: 'wasp',
      siege: 'bombard',
      hunter: 'stalker',
      colossus: 'colossus',
    } satisfies Record<EnemyId, string>,
    soldier: 'footman',
    // The pulse turret, walls, nets and Fortify are frame stacks, not rigs (render/structures.ts).
    structure: { bomb_tower: 'mortar' },
  },
  sfx: Object.fromEntries(
    Object.entries(sfxUrls).map(([p, u]) => [p.slice(p.lastIndexOf('/') + 1, -4), u]),
  ) as ThemeHost['sfx'],
  map: {
    ground: [fk('ground/1'), fk('ground/2'), fk('ground/3'), fk('ground/4')],
    edges: {
      n: fk('edge/n'),
      s: fk('edge/s'),
      e: fk('edge/e'),
      w: fk('edge/w'),
      ne: fk('edge/ne'),
      nw: fk('edge/nw'),
      se: fk('edge/se'),
      sw: fk('edge/sw'),
    },
    lanes: {
      bottom: { open: fk('lane/bottom-open'), sealed: fk('lane/bottom-sealed') },
      left: { open: fk('lane/left-open'), sealed: fk('lane/left-sealed') },
      right: { open: fk('lane/right-open'), sealed: fk('lane/right-sealed') },
    },
    decor: [fk('decor/grate'), fk('decor/plate'), fk('decor/lines'), fk('decor/crack')],
  },
};
