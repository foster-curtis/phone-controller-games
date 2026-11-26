// Hair and skin tones (SPEC §6.11, §12.4; BUILD_PLAN §8 [TF1]/[TF5]): the TV renderer's table
// (`render/tones.ts`, TF1) and the phone's outfit card (`controller/outfit.ts`, TF5) must give a tone
// index the same color on both screens. One shared module would sit outside TF7's files, so this test
// holds the two copies together (BUILD_PLAN §8 [TF7]). Reads the phone file as text: host code never
// imports controller code.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAIR_TONES, SKIN_TONES } from '../../render/tones';

const phone = readFileSync(join(__dirname, '../../../controller/outfit.ts'), 'utf8');

function phoneTable(name: string): number[] {
  const m = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(phone);
  expect(m, name).not.toBeNull();
  return [...m![1]!.matchAll(/'#([0-9a-fA-F]{6})'/g)].map((x) => parseInt(x[1]!, 16));
}

describe('tone tables', () => {
  it('skin tones match the phone', () => expect(phoneTable('SKIN_TONES')).toEqual([...SKIN_TONES]));
  it('hair tones match the phone', () => expect(phoneTable('HAIR_TONES')).toEqual([...HAIR_TONES]));
});
