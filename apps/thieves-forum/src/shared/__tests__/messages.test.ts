import { describe, expect, it } from 'vitest';
import { cleanName, isHostMsg, isPhoneMsg, NAME_MAX } from '../messages';

describe('messages', () => {
  it('guards', () => {
    expect(isPhoneMsg({ t: 'join', name: 'Ada' })).toBe(true);
    expect(isPhoneMsg({ t: 'join' })).toBe(false);
    expect(isPhoneMsg(null)).toBe(false);
    expect(isHostMsg({ t: 'joined', name: 'Ada' })).toBe(true);
    expect(isHostMsg({ t: 'join', name: 'Ada' })).toBe(false);
  });

  it('cleanName trims and caps', () => {
    expect(cleanName('  Gaius   Julius ')).toBe('Gaius Julius');
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX);
    expect(cleanName('   ')).toBe('');
  });
});
