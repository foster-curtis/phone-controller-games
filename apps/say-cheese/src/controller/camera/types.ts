// Phone camera (SPEC §3, §6.3, §7.4): rear camera via getUserMedia, enabled in the lobby, frames
// grabbed from the live <video> on each shot. SC1 implements it.
// Frozen at SC0 (BUILD_PLAN §3): additive changes only.

export type CameraEnableResult = 'ok' | 'denied' | 'unavailable';

/** `idle` before Enable camera; `live` while a track is running; `ended` if the track stopped. */
export type CameraState = 'idle' | 'live' | 'denied' | 'unavailable' | 'ended';

export interface CapturedPhoto {
  /** JPEG, long edge ~800 px (SPEC §7.4). */
  blob: Blob;
  width: number;
  height: number;
}

export interface Camera {
  /** Asks for the rear camera (the permission prompt). Re-acquires the stream if it ended. */
  enable(): Promise<CameraEnableResult>;
  /** Shows the live stream in `video` (preview on the announce screen; source for captures). */
  attach(video: HTMLVideoElement): void;
  /** Grabs the current frame. Rejects if the camera isn't live. */
  capture(): Promise<CapturedPhoto>;
  /** Stops every track. */
  release(): void;
  readonly state: CameraState;
}
