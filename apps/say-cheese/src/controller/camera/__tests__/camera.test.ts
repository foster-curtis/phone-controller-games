// Phone camera (SPEC §3, §7.4, §10 #8): long-edge fit, permission mapping, stream lifetime and
// re-acquire, capture size. jsdom has no media or canvas, so both are faked.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cameraErrorResult, createCamera, fitLongEdge, VIDEO_CONSTRAINTS } from '..';

describe('fitLongEdge', () => {
  it('scales a landscape frame to 800 wide', () => {
    expect(fitLongEdge(1280, 720)).toEqual({ width: 800, height: 450 });
  });
  it('scales a portrait frame to 800 tall', () => {
    expect(fitLongEdge(720, 1280)).toEqual({ width: 450, height: 800 });
  });
  it('never upscales a small frame', () => {
    expect(fitLongEdge(640, 480)).toEqual({ width: 640, height: 480 });
    expect(fitLongEdge(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe('cameraErrorResult', () => {
  it('maps a refusal to denied and everything else to unavailable', () => {
    expect(cameraErrorResult(new DOMException('', 'NotAllowedError'))).toBe('denied');
    expect(cameraErrorResult(new DOMException('', 'SecurityError'))).toBe('denied');
    expect(cameraErrorResult(new DOMException('', 'NotFoundError'))).toBe('unavailable');
    expect(cameraErrorResult(new DOMException('', 'NotReadableError'))).toBe('unavailable');
    expect(cameraErrorResult(new DOMException('', 'OverconstrainedError'))).toBe('unavailable');
    expect(cameraErrorResult(null)).toBe('unavailable');
  });
});

class FakeTrack extends EventTarget {
  readyState: MediaStreamTrackState = 'live';
  stop = vi.fn(() => {
    this.readyState = 'ended';
  });
  end() {
    this.readyState = 'ended';
    this.dispatchEvent(new Event('ended'));
  }
}

function fakeStream(track = new FakeTrack()) {
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  } as unknown as MediaStream;
  return { stream, track };
}

function fakeMedia() {
  const tracks: FakeTrack[] = [];
  const getUserMedia = vi.fn(async (_c?: MediaStreamConstraints) => {
    const { stream, track } = fakeStream();
    tracks.push(track);
    return stream;
  });
  return { media: { getUserMedia }, tracks };
}

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('createCamera', () => {
  it('asks for the rear camera, ideally, without audio', async () => {
    const { media } = fakeMedia();
    const cam = createCamera({ mediaDevices: media });
    expect(cam.state).toBe('idle');
    expect(await cam.enable()).toBe('ok');
    expect(media.getUserMedia).toHaveBeenCalledWith(VIDEO_CONSTRAINTS);
    expect(VIDEO_CONSTRAINTS).toEqual({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
      audio: false,
    });
    expect(cam.state).toBe('live');
  });

  it('reports denied and unavailable', async () => {
    const denied = createCamera({
      mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('', 'NotAllowedError')) },
    });
    expect(await denied.enable()).toBe('denied');
    expect(denied.state).toBe('denied');
    const none = createCamera({
      mediaDevices: { getUserMedia: () => Promise.reject(new DOMException('', 'NotFoundError')) },
    });
    expect(await none.enable()).toBe('unavailable');
    const noApi = createCamera({ mediaDevices: {} as MediaDevices });
    expect(await noApi.enable()).toBe('unavailable');
  });

  it('keeps one stream alive across enables and re-acquires after the track ended', async () => {
    const { media, tracks } = fakeMedia();
    const cam = createCamera({ mediaDevices: media });
    await cam.enable();
    await cam.enable();
    expect(media.getUserMedia).toHaveBeenCalledTimes(1);
    tracks[0]!.end();
    expect(cam.state).toBe('ended');
    expect(await cam.enable()).toBe('ok');
    expect(media.getUserMedia).toHaveBeenCalledTimes(2);
    expect(cam.state).toBe('live');
  });

  it('shows the stream in attached videos as inline, muted playback', async () => {
    const { media } = fakeMedia();
    const cam = createCamera({ mediaDevices: media });
    const preview = document.createElement('video');
    cam.attach(preview);
    await cam.enable();
    expect(preview.srcObject).not.toBeNull();
    expect(preview.hasAttribute('playsinline')).toBe(true);
    expect(preview.muted).toBe(true);
  });

  it('release stops every track and detaches', async () => {
    const { media, tracks } = fakeMedia();
    const cam = createCamera({ mediaDevices: media });
    const preview = document.createElement('video');
    cam.attach(preview);
    await cam.enable();
    cam.release();
    expect(tracks[0]!.stop).toHaveBeenCalled();
    expect(preview.srcObject).toBeNull();
    expect(cam.state).toBe('idle');
    expect(document.querySelector('video')).toBeNull();
  });

  it('capture rejects unless live', async () => {
    const cam = createCamera({ mediaDevices: fakeMedia().media });
    await expect(cam.capture()).rejects.toThrow(/idle/);
  });

  describe('capture', () => {
    let drawn: [number, number] | null;
    let toBlobResult: Blob | null;
    beforeEach(() => {
      drawn = null;
      toBlobResult = new Blob(['jpeg'], { type: 'image/jpeg' });
      vi.spyOn(HTMLVideoElement.prototype, 'videoWidth', 'get').mockReturnValue(1280);
      vi.spyOn(HTMLVideoElement.prototype, 'videoHeight', 'get').mockReturnValue(720);
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
      ) {
        return {
          drawImage: (_v: unknown, _x: number, _y: number, w: number, h: number) => {
            drawn = [w, h];
          },
        } as unknown as CanvasRenderingContext2D;
      } as HTMLCanvasElement['getContext']);
      vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
        this: HTMLCanvasElement,
        cb: BlobCallback,
        type?: string,
        quality?: number,
      ) {
        expect([type, quality]).toEqual(['image/jpeg', 0.7]);
        cb(toBlobResult);
      });
    });

    it('draws the frame with the long edge at 800 and returns a JPEG', async () => {
      const cam = createCamera({ mediaDevices: fakeMedia().media });
      await cam.enable();
      const photo = await cam.capture();
      expect(drawn).toEqual([800, 450]);
      expect(photo).toMatchObject({ width: 800, height: 450 });
      expect(photo.blob.type).toBe('image/jpeg');
    });

    it('errors out visibly when toBlob returns null', async () => {
      toBlobResult = null;
      const cam = createCamera({ mediaDevices: fakeMedia().media });
      await cam.enable();
      await expect(cam.capture()).rejects.toThrow(/empty photo/);
    });

    it('rejects after the track ended', async () => {
      const { media, tracks } = fakeMedia();
      const cam = createCamera({ mediaDevices: media });
      await cam.enable();
      tracks[0]!.end();
      await expect(cam.capture()).rejects.toThrow(/ended/);
    });
  });
});
