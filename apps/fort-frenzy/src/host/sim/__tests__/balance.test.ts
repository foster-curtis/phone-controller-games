// The balance harness (SPEC §15.9; RD3): a report, never a gate. One seed here: every knight runs,
// the Warden with his build policy, and the report is deterministic.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { harnessRun, runHarness } from '../balance/harness';

describe('balance harness', () => {
  it('times every knight alone against the harness wave; same seed, same report', () => {
    const r = runHarness(content, [1]);
    expect(r.rows.map((x) => x.knight)).toEqual(content.knights.map((k) => k.id));
    expect(r.rows.find((x) => x.knight === 'warden')!.builds).toBe(true);
    for (const row of r.rows) expect(row.times).toHaveLength(1);
    expect(r.rows.some((x) => x.median !== null)).toBe(true);
    expect(harnessRun(content, 'warden', 1)).toBe(
      r.rows.find((x) => x.knight === 'warden')!.times[0],
    );
    for (const row of r.rows) {
      if (row.offMean === null) continue;
      const off = Math.abs(row.offMean);
      expect(row.flag).toBe(off > r.bands[1] ? 2 : off > r.bands[0] ? 1 : 0);
    }
  });
});
