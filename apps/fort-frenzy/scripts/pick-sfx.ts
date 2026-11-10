// Picks the v1 SFX set from Foster's Kenney CC0 packs and converts it to loudness-normalized mp3s in
// audio/neon-knights/ (SPEC §12, §15.10, BUILD_PLAN FF13). The outputs are committed sources (§15.1).
//
//   pnpm --filter @pcg/fort-frenzy exec tsx scripts/pick-sfx.ts
//
// Needs ffmpeg on PATH. Never writes under audio/kenney/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SFX_IDS, type SfxId } from '../src/shared/ids';

const root = join(import.meta.dirname, '..');

/** SfxId -> `<pack>/Audio/<file>` under audio/kenney/. */
export const PICKS: Record<SfxId, string> = {
  base_alarm: 'interface-sounds/error_006',
  base_hit: 'impact-sounds/impactMetal_heavy_000',
  player_hit: 'impact-sounds/impactPunch_medium_000',
  enemy_hit: 'impact-sounds/impactGeneric_light_000',
  enemy_death: 'sci-fi-sounds/explosionCrunch_000',
  structure_placed: 'impact-sounds/impactPlank_medium_000',
  structure_destroyed: 'sci-fi-sounds/lowFrequency_explosion_000',
  boss_windup: 'sci-fi-sounds/spaceEngineLow_000',
  purchase: 'interface-sounds/confirmation_002',
  card_pick: 'interface-sounds/select_004',
  wave_start: 'impact-sounds/impactBell_heavy_000',
  victory: 'interface-sounds/confirmation_004',
  defeat: 'sci-fi-sounds/doorClose_000',
};

const outDir = join(root, 'audio', 'neon-knights');
mkdirSync(outDir, { recursive: true });
for (const id of SFX_IDS) {
  const [pack, name] = PICKS[id].split('/');
  const src = join(root, 'audio', 'kenney', pack!, 'Audio', `${name}.ogg`);
  if (!existsSync(src)) throw new Error(`missing source for ${id}: ${src}`);
  const r = spawnSync(
    'ffmpeg',
    [
      '-y',
      '-loglevel',
      'error',
      '-i',
      src,
      '-af',
      'loudnorm=I=-18:TP=-2:LRA=7',
      '-ac',
      '1',
      '-ar',
      '44100',
      '-codec:a',
      'libmp3lame',
      '-q:a',
      '4',
      join(outDir, `${id}.mp3`),
    ],
    { stdio: 'inherit' },
  );
  if (r.status !== 0) throw new Error(`ffmpeg failed for ${id}`);
  console.log(`${id} <- ${PICKS[id]}`);
}
