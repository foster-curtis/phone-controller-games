// A fake `Camera` (SPEC §7.4 contract in camera/types.ts) for dev mode and tests: no getUserMedia; the
// "live" preview and captured frames are a canvas test pattern. The real camera is SC1's.
import type { Camera, CameraEnableResult, CameraState, CapturedPhoto } from './camera/types';

export interface FakeCamera extends Camera {
  captures: number;
  /** What the next `enable()` returns. */
  nextEnable: CameraEnableResult;
}

function pattern(w: number, h: number, n: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = `hsl(${(n * 47) % 360} 60% 45%)`;
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff';
    g.font = '48px sans-serif';
    g.fillText(`TEST ${n}`, 20, h / 2);
  }
  return c;
}

export function createFakeCamera(): FakeCamera {
  let state: CameraState = 'idle';
  const cam: FakeCamera = {
    captures: 0,
    nextEnable: 'ok',
    get state() {
      return state;
    },
    enable() {
      const r = cam.nextEnable;
      state = r === 'ok' ? 'live' : r;
      return Promise.resolve(r);
    },
    attach(video) {
      // jsdom has no canvas.captureStream; the pattern is enough for a preview poster.
      video.setAttribute('data-fake', '1');
      try {
        video.poster = pattern(320, 240, 0).toDataURL();
      } catch {
        /* jsdom: no canvas */
      }
    },
    capture() {
      if (state !== 'live') return Promise.reject(new Error('camera not live'));
      const n = ++cam.captures;
      const blob = new Blob([`fake-${n}`], { type: 'image/jpeg' });
      const photo: CapturedPhoto = { blob, width: 800, height: 600 };
      return Promise.resolve(photo);
    },
    release() {
      state = 'idle';
    },
  };
  return cam;
}
