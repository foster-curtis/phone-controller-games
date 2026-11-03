// One photographer's round (SPEC §6.2): shot count, photos as they arrive, the upload count and
// review navigation. Phase changes live in match.ts.
import type { SeatId } from '../../shared/seats';
import { MAX_SHOTS } from './config';
import type { Round, RoundPhoto } from './types';

/** Before the `shot` arrives (it should come first), a photo is laid out square. */
const DEFAULT_ASPECT = 1;

export function newRound(r: number, photographer: SeatId): Round {
  return { r, photographer, photos: [], tags: [], shots: 0, shootDone: false, view: 0 };
}

function photoAt(round: Round, index: number, aspect?: number): RoundPhoto {
  let p = round.photos.find((q) => q.index === index);
  if (!p) {
    p = { index, aspect: aspect ?? DEFAULT_ASPECT };
    round.photos.push(p);
    round.photos.sort((a, b) => a.index - b.index);
  } else if (aspect !== undefined) {
    p.aspect = aspect;
  }
  return p;
}

/** Records a `shot`; false for an index past the cap. */
export function recordShot(round: Round, photo: number, aspect: number): boolean {
  if (photo >= MAX_SHOTS) return false;
  photoAt(round, photo, aspect);
  round.shots = Math.max(round.shots, photo + 1);
  return true;
}

/** Records a finished photo's object URL; false (caller releases it) if out of range or a repeat. */
export function recordPhoto(round: Round, photo: number, url: string): boolean {
  if (photo >= MAX_SHOTS) return false;
  const p = photoAt(round, photo);
  if (p.url !== undefined) return false;
  p.url = url;
  return true;
}

/** The phone's final count (`shootDone`) replaces the shots seen so far. */
export function recordShootDone(round: Round, count: number): void {
  round.shots = Math.min(MAX_SHOTS, count);
  round.shootDone = true;
}

/** Photos the upload waits for: the phone's final count once known, else the shots seen. */
export const expected = (round: Round): number => round.shots;

export const received = (round: Round): number =>
  round.photos.filter((p) => p.url !== undefined).length;

/** Upload is done when `shootDone` came in and every one of its photos has arrived. */
export const uploadComplete = (round: Round): boolean =>
  round.shootDone && received(round) >= expected(round);

/** Review keeps only the photos that arrived (SPEC §6.2.4 "moves on with whatever arrived"). */
export function keepArrived(round: Round): void {
  round.photos = round.photos.filter((p) => p.url !== undefined);
  round.view = round.photos[0]?.index ?? 0;
}

export const photoUrls = (round: Round | null): string[] =>
  round ? round.photos.flatMap((p) => (p.url === undefined ? [] : [p.url])) : [];
