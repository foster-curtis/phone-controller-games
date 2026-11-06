// Phone camera (SPEC §3, §6.3 Lobby, §7.4, §10 #8): the rear camera via getUserMedia, kept alive
// from Enable camera for the page's life and re-acquired if the track ended (BUILD_PLAN §8). A
// shot draws the live <video> frame to a canvas, long edge ≤ 800 px, as JPEG 0.7.
import type { Camera, CameraEnableResult, CameraState, CapturedPhoto } from './types';

export * from './types';

/** Long edge of a captured photo (SPEC §7.4). */
export const PHOTO_LONG_EDGE = 800;
export const JPEG_QUALITY = 0.7;
/** How long `capture()` waits for the first frame (`videoWidth > 0`) before it gives up. */
const FIRST_FRAME_MS = 3000;

export const VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  // `ideal`, not `exact`: a laptop without a rear camera falls back to any camera.
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
  audio: false,
};

/** Scales `width`×`height` so the long edge is at most `max`; never upscales. */
export function fitLongEdge(
  width: number,
  height: number,
  max: number = PHOTO_LONG_EDGE,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Maps a getUserMedia failure: the user (or a policy) said no vs there's no usable camera. */
export function cameraErrorResult(error: unknown): Exclude<CameraEnableResult, 'ok'> {
  const name = (error as { name?: unknown } | null)?.name;
  return name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError'
    ? 'denied'
    : 'unavailable';
}

export interface CameraEnv {
  /** Default `navigator.mediaDevices` (absent on plain HTTP: the camera is then unavailable). */
  mediaDevices?: Pick<MediaDevices, 'getUserMedia'>;
  /** Default `document` (the hidden capture <video> and the canvas). */
  document?: Document;
}

export function createCamera(env: CameraEnv = {}): Camera {
  const doc = env.document ?? document;
  const media = env.mediaDevices ?? globalThis.navigator?.mediaDevices;
  let state: CameraState = 'idle';
  let stream: MediaStream | null = null;
  let source: HTMLVideoElement | null = null;
  const attached = new Set<HTMLVideoElement>();

  function prepare(video: HTMLVideoElement): void {
    // iOS: inline playback needs both attributes before `srcObject`, then an explicit play().
    video.setAttribute('playsinline', '');
    video.setAttribute('autoplay', '');
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
  }

  function show(video: HTMLVideoElement): void {
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play?.()?.catch(() => undefined);
  }

  /**
   * The capture source: a hidden <video> of our own, so a shot doesn't depend on which screen's
   * preview is mounted. It stays in the DOM (1 px, transparent) because iOS may stop decoding
   * frames for a detached video.
   */
  function captureVideo(): HTMLVideoElement {
    if (!source) {
      source = doc.createElement('video');
      prepare(source);
      source.setAttribute('aria-hidden', 'true');
      source.style.cssText =
        'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;';
      doc.body.append(source);
    }
    return source;
  }

  function stop(): void {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  function trackLive(): boolean {
    const track = stream?.getVideoTracks()[0];
    return !!track && track.readyState === 'live';
  }

  function waitForFrame(video: HTMLVideoElement): Promise<void> {
    if (video.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = () => {
        if (video.videoWidth === 0) return;
        cleanup();
        resolve();
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('The camera has no picture yet.'));
      }, FIRST_FRAME_MS);
      const cleanup = () => {
        clearTimeout(timer);
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('resize', done);
      };
      video.addEventListener('loadeddata', done);
      video.addEventListener('resize', done);
    });
  }

  return {
    get state() {
      if (state === 'live' && !trackLive()) state = 'ended';
      return state;
    },

    async enable() {
      if (state === 'live' && trackLive()) return 'ok';
      stop();
      if (!media?.getUserMedia) {
        state = 'unavailable';
        return 'unavailable';
      }
      let next: MediaStream;
      try {
        next = await media.getUserMedia(VIDEO_CONSTRAINTS);
      } catch (e) {
        state = cameraErrorResult(e);
        return state;
      }
      stream = next;
      const track = next.getVideoTracks()[0];
      if (!track) {
        stop();
        state = 'unavailable';
        return 'unavailable';
      }
      // Backgrounded tab, phone locked, or another app took the camera.
      track.addEventListener('ended', () => {
        if (stream === next) state = 'ended';
      });
      state = 'live';
      show(captureVideo());
      for (const v of attached) show(v);
      return 'ok';
    },

    attach(video) {
      prepare(video);
      attached.add(video);
      if (stream) show(video);
    },

    async capture(): Promise<CapturedPhoto> {
      if (this.state !== 'live') throw new Error(`Camera is ${this.state}.`);
      const video = captureVideo();
      show(video);
      await waitForFrame(video);
      const { width, height } = fitLongEdge(video.videoWidth, video.videoHeight);
      const canvas = doc.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No 2D canvas.');
      ctx.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
      );
      // Some Android builds return null for an empty frame.
      if (!blob || blob.size === 0) throw new Error('The camera returned an empty photo.');
      return { blob, width, height };
    },

    release() {
      stop();
      for (const v of attached) v.srcObject = null;
      attached.clear();
      if (source) {
        source.srcObject = null;
        source.remove();
        source = null;
      }
      state = 'idle';
    },
  };
}
