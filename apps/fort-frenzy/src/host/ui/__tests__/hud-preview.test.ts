// The build-phase HUD's next-wave preview (SPEC §2.6, §9.4; RD5): enemy types and counts, new types
// framed, never the hot side, and no lane bands anywhere in the HUD.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { hudSections, PREVIEW, previewLayout } from '../screens/hud';
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

describe('next-wave banner layout (RC2)', () => {
  it('fits every enemy of every wave 1-15 inside the banner, the first icon right after the text', () => {
    expect(content.waves.length).toBe(15);
    for (const w of content.waves) {
      const { tile, gap, used } = previewLayout(w.allowed.length);
      expect(tile, `wave ${w.n}`).toBeGreaterThanOrEqual(PREVIEW.tileFloor);
      const right = PREVIEW.pad + PREVIEW.textMaxPx + PREVIEW.gap + used;
      expect(right, `wave ${w.n} right edge`).toBeLessThanOrEqual(PREVIEW.width - PREVIEW.pad);
      expect(gap).toBeGreaterThanOrEqual(PREVIEW.gapMin);
    }
  });

  it('stays at full size when it fits, and shrinks before cutting for a very wide wave', () => {
    expect(previewLayout(3)).toMatchObject({ tile: PREVIEW.tile, gap: PREVIEW.gapMax });
    const wide = previewLayout(9);
    expect(wide.tile).toBeLessThanOrEqual(PREVIEW.tile);
    expect(wide.used).toBeLessThanOrEqual(
      PREVIEW.width - 2 * PREVIEW.pad - PREVIEW.gap - PREVIEW.textMaxPx,
    );
  });

  it('sizes the text block to its text: no fixed-width gap before the tiles', () => {
    const css = readFileSync(join(import.meta.dirname, '..', 'ui.css'), 'utf8');
    const head = css.match(/#tv-ui .pv-head {[^}]*}/)![0];
    expect(head).not.toMatch(/min-width/);
    expect(css.match(/#tv-ui .pv-tiles {[^}]*}/)![0]).toMatch(/justify-content: flex-start/);
  });
});
