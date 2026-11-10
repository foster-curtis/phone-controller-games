// FF15-fix-1: the stress overlay's part count skips rig-root children that aren't part sets (the
// extras graphics, e.g. the Ranger's bow string), which crashed `?debug=1&stress=1`.
import { describe, expect, it } from 'vitest';
import { rigPartCount } from '../rigMath';

describe('rigPartCount', () => {
  it('counts the parts of every part set and ignores children without a list', () => {
    const set = (n: number) => ({ list: Array.from({ length: n }, () => ({})) });
    const graphics = { type: 'Graphics' };
    expect(rigPartCount({ list: [set(9), graphics, set(3)] })).toBe(12);
    expect(rigPartCount({ list: [graphics] })).toBe(0);
    expect(rigPartCount({ list: [] })).toBe(0);
  });
});
