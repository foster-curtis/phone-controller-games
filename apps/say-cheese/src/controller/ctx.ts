// What every phone screen gets (SPEC §6.7): an injected send, camera and sfx, so screens never touch
// the network or the real camera (SC5 wires the real ones; dev mode and tests inject fakes).
import type { PhoneMsg } from '../shared/messages';
import type { Sfx } from '../shared/sfx';
import type { Camera, CapturedPhoto } from './camera/types';

export interface Ctx {
  send(msg: PhoneMsg): void;
  camera: Camera;
  sfx: Sfx;
  /** Local object URL of a photo this phone took in round `r`, or null when it lost it. */
  photoUrl(r: number, photo: number): string | null;
  /** SC5 hook: a shot was captured (stash the blob for the upload). */
  onCapture?(r: number, photo: number, captured: CapturedPhoto): void;
  /** Clock in ms (performance.now by default); tests inject a fake. */
  now(): number;
  /** Persisted display name (localStorage), written on join and on change. */
  getName(): string;
  setName(name: string): void;
  /** Shutter cooldown, ms. */
  cooldownMs: number;
}

/** SPEC §6.2 (0.4 s). The controller can't import host/ (lint), so it keeps its own copy of the value. */
export const DEFAULT_COOLDOWN_MS = 400;
