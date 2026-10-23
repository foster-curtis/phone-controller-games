import { describe, expect, it } from 'vitest';
import { RELAY_DEFAULTS, createRelay } from './index';

describe('relay contract', () => {
  it('exports createRelay and the documented defaults', () => {
    expect(typeof createRelay).toBe('function');
    expect(RELAY_DEFAULTS.port).toBe(8787);
  });
});
