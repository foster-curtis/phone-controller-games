// Clip registry (SPEC §12.2): every clip by `<rig>/<clip>` or `<rig>/<clip>@<view>`, keyed by rig
// only, never by who controls a character (SPEC §6.11).
import type { Clip, RigId } from '../types';
import { clips as citizen } from './citizen';
import { clips as guard } from './guard';
import { clips as merchant } from './merchant';

export const CLIPS_BY_RIG: Readonly<Record<RigId, Readonly<Record<string, Clip>>>> = {
  citizen,
  merchant,
  guard,
};

export const CLIPS: Readonly<Record<string, Clip>> = Object.fromEntries(
  (Object.entries(CLIPS_BY_RIG) as [RigId, Record<string, Clip>][]).flatMap(([rig, byName]) =>
    Object.entries(byName).map(([name, clip]) => [`${rig}/${name}`, clip]),
  ),
);

/** Clip names a rig can play (variants folded into their base name). */
export function clipNames(rig: RigId): string[] {
  return [...new Set(Object.keys(CLIPS_BY_RIG[rig]).map((k) => k.split('@')[0]!))];
}
