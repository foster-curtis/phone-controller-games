// The Artificer's backpack gauge is his build meter (SPEC §2.4; RD8): `k = floor(meter × 6)`; cell N
// from the bottom is full at k ≥ 2N and half at k = 2N − 1.
import { describe, expect, it } from 'vitest';
import { gaugeGroups, gaugeSteps } from '../gauge';

const CELLS: [meter: number, groups: string[]][] = [
  [0, []],
  [1 / 6, ['core3-half']],
  [2 / 6, ['core3-full']],
  [3 / 6, ['core3-full', 'core2-half']],
  [4 / 6, ['core3-full', 'core2-full']],
  [5 / 6, ['core3-full', 'core2-full', 'core1-half']],
  [1, ['core3-full', 'core2-full', 'core1-full']],
];

describe('the gauge shows the build meter', () => {
  it.each(CELLS)('at meter %d', (meter, groups) => {
    expect(gaugeGroups(gaugeSteps(meter))).toEqual(groups);
  });

  it('floors: a cell half lights only once the meter reaches its sixth', () => {
    expect(gaugeSteps(1 / 6 - 0.001)).toBe(0);
    expect(gaugeSteps(5 / 6 - 0.001)).toBe(4);
    expect(gaugeSteps(0.999)).toBe(5);
  });

  it('clamps a meter outside 0..1', () => {
    expect(gaugeSteps(-1)).toBe(0);
    expect(gaugeSteps(2)).toBe(6);
  });
});
