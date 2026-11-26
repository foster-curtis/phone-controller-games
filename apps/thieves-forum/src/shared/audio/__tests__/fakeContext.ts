// Fake AudioContext for the audio tests (SPEC §12.8, BUILD_PLAN TF11): records gain automation and
// started sources, no real audio. Shape follows say-cheese's synth test fake (extraction candidate).
import type { AudioCtxLike } from '../engine';

export interface Call {
  fn: 'set' | 'ramp' | 'cancel';
  v?: number;
  t: number;
}

export class FakeParam {
  value = 1;
  calls: Call[] = [];
  setValueAtTime(v: number, t: number) {
    this.value = v;
    this.calls.push({ fn: 'set', v, t });
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.calls.push({ fn: 'ramp', v, t });
  }
  cancelScheduledValues(t: number) {
    this.calls.push({ fn: 'cancel', t });
  }
}

export interface FakeNode {
  gain: FakeParam;
  pan: { value: number };
  buffer: { length: number; sampleRate: number; duration: number } | null;
  playbackRate: { value: number };
  connect: (n: unknown) => void;
  start: (t: number) => void;
  started?: number;
  out?: unknown;
  kind: string;
}

export class FakeContext implements AudioCtxLike {
  currentTime = 0;
  sampleRate = 8000;
  state = 'suspended';
  destination = { dest: true };
  nodes: FakeNode[] = [];
  /** Buffer sources started, in order. */
  sources: FakeNode[] = [];
  resumed = 0;
  resume() {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
  private node(kind: string): FakeNode {
    const n: FakeNode = {
      kind,
      gain: new FakeParam(),
      pan: { value: 0 },
      buffer: null,
      playbackRate: { value: 1 },
      connect: (o) => {
        n.out = o;
      },
      start: (t) => {
        n.started = t;
        if (kind === 'source') this.sources.push(n);
      },
    };
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.node('gain');
  }
  createStereoPanner() {
    return this.node('pan');
  }
  createBufferSource() {
    return this.node('source');
  }
  createBuffer(_c: number, length: number, rate: number) {
    return {
      length,
      sampleRate: rate,
      duration: length / rate,
      data: new Float32Array(length),
      getChannelData() {
        return this.data;
      },
    };
  }
}

/** Deterministic 0..1 generator (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
