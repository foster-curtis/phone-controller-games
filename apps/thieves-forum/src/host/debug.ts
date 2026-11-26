// Host debug hooks (BUILD_PLAN §2, TF7; SPEC §12.1 `debugHooks/`): `window.__pcg`, installed only in
// dev or with `?debug=1` (main.ts imports this module only then). Every file in `debugHooks/` is one
// hook group (append-only registry, found with `import.meta.glob`) that adds its hooks through
// `registerDebug`; later milestones add a file instead of editing this one. e2e reads them.
import { installDebug } from '@pcg/game-kit';
import type { Runtime } from './game';

export type RegisterDebug = (name: string, hook: unknown) => void;

/** A hook group's default export. */
export type HookGroup = (rt: Runtime, register: RegisterDebug) => void;

export type DebugApi = Record<string, unknown> & { registerDebug: RegisterDebug };

const groups = import.meta.glob<HookGroup>('./debugHooks/*.ts', {
  eager: true,
  import: 'default',
});

export function installHostDebug(rt: Runtime, target?: { __pcg?: unknown }): DebugApi {
  const api = {} as DebugApi;
  api.registerDebug = (name, hook) => {
    api[name] = hook;
  };
  for (const key of Object.keys(groups).sort()) groups[key]!(rt, api.registerDebug);
  installDebug(api, target);
  return api;
}
