// Host debug hooks: `window.__pcg`, installed only in dev or with `?debug=1`. Each game defines its own
// API shape; the kit only decides when to install it and where it goes.

/** On in dev builds or with `?debug=1`. Apps pass `import.meta.env.DEV`. */
export function debugEnabled(
  dev: boolean,
  search: string = globalThis.location?.search ?? '',
): boolean {
  return dev || new URLSearchParams(search).get('debug') === '1';
}

/** Sets `target.__pcg = api` (default target: the global object, i.e. `window`). */
export function installDebug<T>(
  api: T,
  target: { __pcg?: unknown } = globalThis as { __pcg?: unknown },
): void {
  target.__pcg = api;
}
