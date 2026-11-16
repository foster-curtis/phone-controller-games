// Node test harness for How to play illustration scripts (SPEC §6.9): a Proxy-built stand-in for a
// Phaser.Scene whose factories return chainable recording fakes, so a script can run create, draw
// and destroy headless and a test can assert nothing is left alive.
import type * as Phaser from 'phaser';

export interface FakeObject {
  kind: string;
  destroyed: boolean;
  /** Every method call as [name, args]. */
  calls: [string, unknown[]][];
}

export interface FakeScene {
  /** Pass to `script.create`. */
  scene: Phaser.Scene;
  /** Every object made through `scene.add.*` / `scene.make.*`, in creation order. */
  objects: FakeObject[];
  /** Live listener count per emitter name (`events`, `sys.events`, `time`, `tweens`). */
  listeners: Record<string, number>;
  /** Live timers and tweens (created and not yet stopped/removed/destroyed). */
  live: { timers: number; tweens: number };
}

const OFF = new Set(['off', 'removeListener']);
const ON = new Set(['on', 'once', 'addListener']);
const END = new Set(['destroy', 'stop', 'remove', 'complete']);

type Hook = (name: string, args: unknown[]) => void;

/** A chainable fake: unknown methods record the call and return the fake; sets/gets are stored. */
function chain(rec: FakeObject, onCall?: Hook): unknown {
  const props = new Map<PropertyKey, unknown>();
  const self: unknown = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'then' || typeof prop === 'symbol') return undefined;
      if (prop === 'destroyed') return rec.destroyed;
      if (props.has(prop)) return props.get(prop);
      return (...args: unknown[]) => {
        rec.calls.push([prop, args]);
        if (END.has(prop)) rec.destroyed = true;
        onCall?.(prop, args);
        return self;
      };
    },
    set(_t, prop, value) {
      props.set(prop, value);
      return true;
    },
  });
  return self;
}

export function createFakeScene(): FakeScene {
  const objects: FakeObject[] = [];
  const listeners: Record<string, number> = {};
  const live = { timers: 0, tweens: 0 };

  const make = (kind: string, onCall?: Hook): unknown => {
    const rec: FakeObject = { kind, destroyed: false, calls: [] };
    objects.push(rec);
    return chain(rec, onCall);
  };
  const plain = (kind: string, onCall?: Hook): unknown =>
    chain({ kind, destroyed: false, calls: [] }, onCall);

  // `scene.add.graphics()`, `.text()`, `.container()`, ... each make a tracked object.
  const factory = (): unknown =>
    new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (typeof prop === 'symbol' || prop === 'then') return undefined;
          if (prop === 'existing') return (o: unknown) => o;
          return () => make(prop);
        },
      },
    );

  // Event emitters count live listeners by name.
  const emitter = (name: string): unknown => {
    listeners[name] = 0;
    return plain(name, (m) => {
      if (ON.has(m)) listeners[name]!++;
      else if (m === 'removeAllListeners') listeners[name] = 0;
      else if (OFF.has(m)) listeners[name] = Math.max(0, listeners[name]! - 1);
    });
  };

  // `scene.time` / `scene.tweens`: creators make a live timer or tween until it ends.
  const scheduler = (name: 'timers' | 'tweens', creators: string[]): unknown => {
    listeners[name] = 0;
    const base = emitter(name) as Record<string, unknown>;
    return new Proxy(base, {
      get(t, prop) {
        if (typeof prop === 'string' && creators.includes(prop)) {
          return () => {
            live[name]++;
            let ended = false;
            return make(name, (m) => {
              if (END.has(m) && !ended) {
                ended = true;
                live[name]--;
              }
            });
          };
        }
        return t[prop as string];
      },
    });
  };

  const sysEvents = emitter('sys.events');
  const sys = new Proxy(
    {},
    {
      get: (_t, p) =>
        p === 'events' ? sysEvents : typeof p === 'symbol' ? undefined : plain('sys'),
    },
  );
  const parts: Record<string, unknown> = {
    add: factory(),
    make: factory(),
    events: emitter('events'),
    sys,
    time: scheduler('timers', ['addEvent', 'delayedCall']),
    tweens: scheduler('tweens', ['add', 'addCounter', 'chain', 'create']),
  };
  const scene = new Proxy(parts, {
    get: (t, p) => (typeof p === 'symbol' || p === 'then' ? undefined : p in t ? t[p] : plain(p)),
  }) as unknown as Phaser.Scene;

  return { scene, objects, listeners, live };
}

/** Throws unless every created object was destroyed and no listener, timer or tween remains. */
export function assertClean(fake: FakeScene): void {
  const problems: string[] = [];
  fake.objects.forEach((o, i) => {
    if (!o.destroyed) problems.push(`object #${i} (${o.kind}) not destroyed`);
  });
  for (const [name, n] of Object.entries(fake.listeners)) {
    if (n > 0) problems.push(`${n} listener(s) left on ${name}`);
  }
  if (fake.live.timers > 0) problems.push(`${fake.live.timers} timer(s) alive`);
  if (fake.live.tweens > 0) problems.push(`${fake.live.tweens} tween(s) alive`);
  if (problems.length > 0) throw new Error(`fake scene not clean:\n${problems.join('\n')}`);
}
