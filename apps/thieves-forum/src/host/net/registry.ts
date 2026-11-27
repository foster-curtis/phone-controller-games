// The handler and context-provider registries (SPEC §12.1, §12.5; BUILD_PLAN §2 append-only, TF12):
// one file per discrete phone message in `handlers/` and one per main-button action in `context/`,
// found with `import.meta.glob` so later milestones add a file instead of editing a switch.
import type { PhoneMsg } from '../../shared/messages';
import type { PlayerId } from '../sim/types';
import {
  MAIN_PRIORITY,
  type ContextInput,
  type ContextProvider,
  type HandlerCtx,
  type MessageHandler,
} from './types';

const handlerFiles = import.meta.glob<MessageHandler>('./handlers/*.ts', {
  eager: true,
  import: 'default',
});
const contextFiles = import.meta.glob<ContextProvider>('./context/*.ts', {
  eager: true,
  import: 'default',
});

/** Handlers by message tag; a second file for one tag is a build error (thrown at load). */
export function loadHandlers(
  files: Record<string, MessageHandler> = handlerFiles,
): ReadonlyMap<PhoneMsg['t'], MessageHandler> {
  const out = new Map<PhoneMsg['t'], MessageHandler>();
  for (const key of Object.keys(files).sort()) {
    const h = files[key]!;
    if (out.has(h.t)) throw new Error(`net/handlers: two handlers for "${h.t}" (${key})`);
    out.set(h.t, h);
  }
  return out;
}

/** Providers in main-button priority order (SPEC §6.17). */
export function loadContextProviders(
  files: Record<string, ContextProvider> = contextFiles,
): readonly ContextProvider[] {
  const rank = (p: ContextProvider) => MAIN_PRIORITY.indexOf(p.action);
  return Object.keys(files)
    .sort()
    .map((k) => files[k]!)
    .sort((a, b) => rank(a) - rank(b));
}

/** Dispatches one phone message to its handler; unknown tags (later milestones) are ignored. */
export function dispatchPhone(
  handlers: ReadonlyMap<PhoneMsg['t'], MessageHandler>,
  msg: PhoneMsg,
  from: PlayerId,
  ctx: HandlerCtx,
): boolean {
  const h = handlers.get(msg.t);
  if (!h) return false;
  (h.handle as (m: PhoneMsg, f: PlayerId, c: HandlerCtx) => void)(msg, from, ctx);
  return true;
}

/** The main button now: the first provider (by priority) that applies, or null (blank). */
export function mainAction(
  providers: readonly ContextProvider[],
  input: ContextInput,
): ContextProvider['action'] | null {
  for (const p of providers) if (p.available(input)) return p.action;
  return null;
}
