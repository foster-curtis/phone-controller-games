// The forum's AudioMap (SPEC §6.20, §9 "audio map in config", §12.8; BUILD_PLAN TF11). File names follow
// the §9 step 7 delivery list under `audio/forum/`. Files are found with `import.meta.glob`, so a file
// that does not exist yet is simply absent (src null → synthesized placeholder, no request, no build
// error). TF19 adds the files and retunes the gains here; these numbers are tuning, not frozen.
import type { AudioMap, AudioSrc } from '../../shared/audio';
import { SFX_CUES, type SfxCue } from '../../shared/sfx';

const found = import.meta.glob<string>('/audio/forum/**/*.mp3', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Bed file (§6.20: one long loop). */
export const FORUM_BED_FILE = 'bed/crowd-loop';

/** One-shot pool, in the order of the synth recipes (`FORUM_SYNTH.oneShots`). */
export const FORUM_ONE_SHOT_FILES = [
  'ambience/vendor-call-1',
  'ambience/vendor-call-2',
  'ambience/vendor-call-3',
  'ambience/pottery-clink-1',
  'ambience/pottery-clink-2',
  'ambience/coins-counted-1',
  'ambience/coins-counted-2',
  'ambience/cart-wheel',
  'ambience/donkey',
  'ambience/dog-distant',
  'ambience/fountain',
] as const;

const CUE_FILES: Record<SfxCue, string> = {
  coinClink: 'sfx/coin-clink',
  glanceSwoosh: 'sfx/glance-swoosh',
  thiefShout: 'sfx/thief-shout',
  guardWhistle: 'sfx/guard-whistle',
  gateCreak: 'sfx/gate-creak',
  stocksClank: 'sfx/stocks-clank',
  roundBell: 'sfx/round-bell',
  revealPop: 'sfx/reveal-pop',
  fanfare: 'sfx/fanfare',
  firework: 'sfx/firework',
};

/** Gain per cue, dB, and whether it ducks the ambience (§6.20: THIEF!, whistle, catches). */
const CUE_MIX: Record<SfxCue, { gainDb: number; ducks: boolean }> = {
  coinClink: { gainDb: -8, ducks: false },
  glanceSwoosh: { gainDb: -10, ducks: false },
  thiefShout: { gainDb: -4, ducks: true },
  guardWhistle: { gainDb: -6, ducks: true },
  gateCreak: { gainDb: -8, ducks: false },
  stocksClank: { gainDb: -6, ducks: true },
  roundBell: { gainDb: -5, ducks: false },
  revealPop: { gainDb: -8, ducks: false },
  fanfare: { gainDb: -6, ducks: false },
  firework: { gainDb: -8, ducks: false },
};

/** Build the map from a file table (path under `/audio/forum/` → URL); tests pass their own. */
export function createForumAudioMap(files: Record<string, string> = found): AudioMap<SfxCue> {
  const src = (name: string): AudioSrc => files[`/audio/forum/${name}.mp3`] ?? null;
  const cues = {} as AudioMap<SfxCue>['cues'];
  for (const cue of SFX_CUES) cues[cue] = { src: src(CUE_FILES[cue]), ...CUE_MIX[cue] };
  return {
    // Fixed gain, quiet under everything (§6.20); the crossfade hides the loop point.
    bed: { src: src(FORUM_BED_FILE), gainDb: -18, loopCrossfadeMs: 2000 },
    oneShots: {
      srcs: FORUM_ONE_SHOT_FILES.map(src),
      intervalMs: [2000, 6000], // §7
      gainDb: -14,
      gainJitterDb: 3,
      pitchJitter: 0.05,
      panRange: 0.8,
      noRepeat: true,
    },
    cues,
    // §7: −8 dB for ~1 s (100 ms down, 700 ms hold, 200 ms up).
    duck: { db: -8, ms: 1000, attackMs: 100, releaseMs: 200 },
    silentAmbienceIn: ['silent', 'reveal', 'podium'],
  };
}

export const FORUM_AUDIO_MAP: AudioMap<SfxCue> = createForumAudioMap();
