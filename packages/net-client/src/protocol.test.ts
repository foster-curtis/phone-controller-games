import { describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './protocol';

describe('room code alphabet', () => {
  it('is unambiguous letters only', () => {
    expect(ROOM_CODE_ALPHABET).toMatch(/^[A-Z]+$/);
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[IO]/);
    expect(new Set(ROOM_CODE_ALPHABET).size).toBe(ROOM_CODE_ALPHABET.length);
    expect(ROOM_CODE_LENGTH).toBe(4);
  });
});
