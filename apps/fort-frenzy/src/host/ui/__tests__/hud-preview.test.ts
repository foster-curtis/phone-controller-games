// The build-phase HUD's next-wave preview (SPEC §2.6, §9.4; RD5): enemy types and counts, new types
// framed, never the hot side, and no lane bands anywhere in the HUD.
import { describe, expect, it } from 'vitest';
import { hudSections } from '../screens/hud';
import type { TvView } from '../types';
import type { TeamView } from '../../../shared/messages';

const team = {
  phase: 'build',
  wave: 4,
  buildEndsInMs: 12000,
  coins: 30,
  baseHp: 900,
  baseMaxHp: 1000,
  nextWave: {
    enemies: [
      { id: 'grunt', count: 12 },
      { id: 'runner', count: 4 },
      { id: 'swarm', count: 20 },
    ],
    boss: false,
  },
} as unknown as TeamView;

const view = {
  screen: 'build',
  team,
  room: null,
  bossBar: null,
  announcements: [],
  lowHpAlarm: false,
  wishlist: [],
  readyStatus: [],
  nextWaveNew: ['runner'],
} as unknown as TvView;

const html = (v: TvView) =>
  hudSections(v, { hit: false, armedSlot: null })
    .map((s) => s.html)
    .join('\n');

describe('HUD next-wave preview', () => {
  it('shows each type with its count and frames the new ones', () => {
    const out = hudSections(view, { hit: false, armedSlot: null }).find(
      (s) => s.name === 'preview',
    )!;
    expect(out.html).toContain('×12');
    expect(out.html).toContain('×4');
    expect(out.html).toContain('×20');
    expect(out.html).toContain('36 enemies');
    expect(out.html.match(/class="eny new"/g)).toHaveLength(1);
  });

  it('never names a side or a lane (the hot side is never shown)', () => {
    expect(html(view)).not.toMatch(/\b(hot|lane|left|right|bottom|portal)\b/i);
  });
});
