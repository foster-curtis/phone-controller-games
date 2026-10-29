// Schema-driven input sender: the phone's input state as a flat number tuple (Fort Frenzy SPEC §15.6,
// Sunny Side SPEC §7.2). The schema names each tuple slot; analog slots (sticks, aims) are paced by
// the mode, every other change (button bits, flags, counters, discrete values) is an edge and goes out
// at once, so a fire and its aim arrive together.
// - `onChange` (Sunny Side): analog changes are sent at most every `minGapMs` (30 Hz), plus a
//   keepalive every `keepaliveMs` (5 Hz) when nothing else was sent.
// - `fixedRate` (Fort Frenzy): `activeHz` (30) while any control is touched, `idleHz` (5) otherwise,
//   so a held-still thumb never goes stale under the host's 250 ms rule.

export type SenderMode =
  | { kind: 'onChange'; minGapMs?: number; keepaliveMs?: number }
  | { kind: 'fixedRate'; activeHz?: number; idleHz?: number };

export interface InputSchema<K extends string> {
  /** Tuple layout: one name per slot, in wire order. */
  layout: readonly K[];
  /** Slots paced by the mode. Every slot not listed here is an edge. */
  analog?: readonly K[];
  /** Monotonic counters: `neutral()` keeps them; `bump()` increments them. */
  counters?: readonly K[];
  /** A bitfield slot driven by `setButton`; `presses` bumps a counter on each bit's press. */
  buttons?: { slot: K; presses?: Readonly<Partial<Record<number, K>>> };
  /** Starting and neutral values (default 0), e.g. `radialSlot: -1`. */
  initial?: Readonly<Partial<Record<K, number>>>;
  mode: SenderMode;
}

export interface InputSender<K extends string = string> {
  /** Sets slots at once (one send at most). Unchanged values are ignored. */
  update(values: Readonly<Partial<Record<K, number>>>): void;
  /** Sets or clears one bit of the buttons slot; a press bumps its counter. */
  setButton(bit: number, down: boolean): void;
  /** Increments a counter, setting `values` in the same send (e.g. a fire with its aim). */
  bump(counter: K, values?: Readonly<Partial<Record<K, number>>>): void;
  /** Marks control `id` touched or released (fixed-rate pacing; ignored by `onChange`). */
  touch(id: string, on: boolean): void;
  /** Resets every non-counter slot to its initial value and clears touches; sends once if running. */
  neutral(): void;
  /** Starts sending (immediately sends the current tuple). */
  start(): void;
  stop(): void;
  readonly running: boolean;
  tuple(): number[];
  /** Current value of one slot. */
  get(slot: K): number;
}

/** Defaults: 30 Hz cap / 5 Hz keepalive (`onChange`); 30 Hz touched / 5 Hz idle (`fixedRate`). */
export const SEND_MIN_GAP_MS = 34;
export const SEND_KEEPALIVE_MS = 200;
export const SEND_ACTIVE_HZ = 30;
export const SEND_IDLE_HZ = 5;

export function createInputSender<K extends string>(
  schema: InputSchema<K>,
  send: (tuple: number[]) => void,
): InputSender<K> {
  const index = new Map<K, number>(schema.layout.map((k, i) => [k, i]));
  const analog = new Set<K>(schema.analog ?? []);
  const counters = new Set<K>(schema.counters ?? []);
  const initial = schema.layout.map((k) => schema.initial?.[k] ?? 0);
  const values = [...initial];
  const slotOf = (k: K): number => {
    const i = index.get(k);
    if (i === undefined) throw new Error(`input sender: unknown slot "${k}"`);
    return i;
  };
  const buttonsAt = schema.buttons ? slotOf(schema.buttons.slot) : -1;
  const mode = schema.mode;
  const touched = new Set<string>();

  let running = false;
  let last = -Infinity;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  const tuple = () => [...values];
  const period = () => {
    if (mode.kind !== 'fixedRate') return 0;
    const hz = touched.size > 0 ? (mode.activeHz ?? SEND_ACTIVE_HZ) : (mode.idleHz ?? SEND_IDLE_HZ);
    return Math.round(1000 / hz);
  };
  const flush = () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
    last = Date.now();
    send(tuple());
    // Fixed rate: the next send is one period after this one (edges restart the clock).
    if (mode.kind === 'fixedRate' && running) pending = setTimeout(flush, period());
  };
  const paced = () => {
    if (!running || mode.kind !== 'onChange') return; // fixed rate: the next tick carries it
    const wait = (mode.minGapMs ?? SEND_MIN_GAP_MS) - (Date.now() - last);
    if (wait <= 0) flush();
    else if (pending === null) pending = setTimeout(flush, wait);
  };

  /** Applies values; returns 'edge', 'analog' or null (nothing changed). */
  const apply = (vals: Readonly<Partial<Record<K, number>>>): 'edge' | 'analog' | null => {
    let kind: 'edge' | 'analog' | null = null;
    for (const k of Object.keys(vals) as K[]) {
      const v = vals[k];
      if (v === undefined) continue;
      const i = slotOf(k);
      if (values[i] === v) continue;
      values[i] = v;
      if (!analog.has(k)) kind = 'edge';
      else if (kind === null) kind = 'analog';
    }
    return kind;
  };

  return {
    update(vals) {
      const kind = apply(vals);
      if (kind === 'edge') {
        if (running) flush();
      } else if (kind === 'analog') paced();
    },
    setButton(bit, down) {
      if (buttonsAt < 0) throw new Error('input sender: the schema has no buttons slot');
      const cur = values[buttonsAt]!;
      if (!!(cur & bit) === down) return;
      if (down) {
        values[buttonsAt] = cur | bit;
        const counter = schema.buttons?.presses?.[bit];
        if (counter !== undefined) values[slotOf(counter)]!++;
      } else {
        values[buttonsAt] = cur & ~bit;
      }
      if (running) flush();
    },
    bump(counter, vals?) {
      if (vals) apply(vals);
      values[slotOf(counter)]!++;
      if (running) flush();
    },
    touch(id, on) {
      const was = touched.size > 0;
      if (on) touched.add(id);
      else touched.delete(id);
      // Rate change: send now and continue at the new rate (a release goes out at once).
      if (mode.kind === 'fixedRate' && running && was !== touched.size > 0) flush();
    },
    neutral() {
      schema.layout.forEach((k, i) => {
        if (!counters.has(k)) values[i] = initial[i]!;
      });
      touched.clear();
      if (running) flush();
    },
    start() {
      if (running) return;
      running = true;
      flush();
      if (mode.kind === 'onChange') {
        const ms = mode.keepaliveMs ?? SEND_KEEPALIVE_MS;
        keepalive = setInterval(() => {
          if (Date.now() - last >= ms) flush();
        }, ms);
      }
    },
    stop() {
      running = false;
      if (pending !== null) clearTimeout(pending);
      if (keepalive !== null) clearInterval(keepalive);
      pending = keepalive = null;
    },
    get running() {
      return running;
    },
    tuple,
    get: (k) => values[slotOf(k)]!,
  };
}
