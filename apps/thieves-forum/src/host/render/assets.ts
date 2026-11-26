// The forum's TV assets (SPEC §12.10): rigs from art/forum/rigs/*.json, the generated manifest and
// the packed atlases at 1× and 2× (URLs through Vite). No Phaser here, so tests import it.
import { manifest } from '../../../generated/manifest';
import citizen from '../../../art/forum/rigs/citizen.json';
import guard from '../../../art/forum/rigs/guard.json';
import merchant from '../../../art/forum/rigs/merchant.json';
import type { AssetManifest, RigDef, RigId } from './types';

export const MANIFEST: AssetManifest = manifest;

export const RIGS: Readonly<Record<RigId, RigDef>> = {
  citizen: citizen as unknown as RigDef,
  merchant: merchant as unknown as RigDef,
  guard: guard as unknown as RigDef,
};

/** A packed atlas with Vite URLs. */
export interface AtlasRef {
  key: string;
  json: string;
  image: string;
  scale: 1 | 2;
}

const atlasUrls = import.meta.glob<string>('../../../generated/atlases/*.{png,json}', {
  query: '?url',
  import: 'default',
  eager: true,
});
const url = (path: string) => atlasUrls[`../../../generated/${path}`] ?? '';

export const ATLASES: readonly AtlasRef[] = MANIFEST.atlases.map((a) => ({
  key: a.key,
  json: url(a.json),
  image: url(a.image),
  scale: a.scale,
}));
