// Room codes and secret tokens.
import { randomBytes, randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type RoomCode } from '@pcg/net-client';

/** Uniform float in [0, 1). */
export type Rng = () => number;

const cryptoRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

/** A random code not rejected by `isTaken`; retries on collision (24⁴ ≈ 330k codes). */
export function generateCode(isTaken: (code: RoomCode) => boolean, rng: Rng = cryptoRng): RoomCode {
  for (let attempt = 0; attempt < 10_000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[Math.floor(rng() * ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('generateCode: code space exhausted');
}

/** Unguessable opaque token (host tokens, reconnect tokens). */
export function generateToken(): string {
  return randomBytes(18).toString('base64url');
}
