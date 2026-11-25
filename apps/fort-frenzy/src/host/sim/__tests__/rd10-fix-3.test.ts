// RD10-fix-3 (RC3 note 2, SPEC §9.2): the Colossus's stagger meter fills 15% slower; the stagger
// itself lasts as long as before. The Wasp's part of the fix is in render/__tests__/rd10-fix-3.test.ts.
import { describe, expect, it } from 'vitest';
import { content, type Content } from '../../../content';
import { colossus as colossusDef } from '../../../content/balance';
import { tuning } from '../boss/colossus';
import { createCatalog } from '../catalog';
import { createState } from '../state';
import { startOf } from './harness';

/** The Colossus's meter before RD10-fix-3. */
const OLD = { staggerPerHp: 3, staggerStun: 0.25, staggerMs: 3000 };

/** Equal hits of 0.5% of its max HP on a lone Colossus until it staggers; returns the hit count. */
function hitsToStagger(c: Content): number {
  const s = createState(startOf(1, 1), createCatalog(c, 'normal'));
  const b = s.spawnEnemy('colossus', 18, 12, null);
  const hit = b.maxHp * 0.005;
  for (let n = 1; n <= 1000; n++) {
    s.damage({ source: null, target: b.id, amount: hit, kind: 'ranged', tags: [] });
    if (b.boss!.staggeredUntil !== null) return n;
  }
  throw new Error('never staggered');
}

/** The content with the Colossus's stagger params as they were before RD10-fix-3. */
function withOldMeter(): Content {
  return {
    ...content,
    enemies: content.enemies.map((e) =>
      e.id === 'colossus' && e.boss
        ? { ...e, boss: { ...e.boss, params: { ...e.boss.params, ...OLD } } }
        : e,
    ),
  };
}

describe('RC3: the Colossus staggers a little less often', () => {
  it('both meter sources fill 15% slower; the stagger lasts as long', () => {
    const T = tuning(colossusDef);
    expect(T.staggerPerHp).toBeCloseTo(OLD.staggerPerHp * 0.85, 9);
    expect(T.staggerStun).toBeCloseTo(OLD.staggerStun * 0.85, 9);
    expect(T.staggerMs).toBe(OLD.staggerMs);
  });

  it('the damage sequence that staggered it at N hits now needs about 15% more', () => {
    const before = hitsToStagger(withOldMeter());
    const now = hitsToStagger(content);
    expect(before).toBe(67);
    expect(now / before).toBeGreaterThan(1.12);
    expect(now / before).toBeLessThan(1.2);
  });
});
