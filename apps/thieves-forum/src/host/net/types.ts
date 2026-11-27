// Host message-handler and context-provider registries (SPEC §12.1 `host/net`, §12.5; BUILD_PLAN TF12).
// Every discrete phone message has one handler file in `handlers/` and every main-button action one
// provider file in `context/`, found with `import.meta.glob` (append-only registries, BUILD_PLAN §2):
// TF13/TF14 add `buy`, `sell`, `toss`, `tip*` handlers and the SELL / PICKPOCKET providers as new files.
// Frozen at TF12 (BUILD_PLAN §3): additive changes only.
import type { Content } from '../../content/types';
import type { HostMsg, MainAction, PhoneMsg } from '../../shared/messages';
import type { MatchEvent } from '../match/match';
import type { Character, PlayerId, SimCommand, World } from '../sim/types';
import type { InputStore } from './inputs';

/** What a handler may do: queue sim commands, feed the match, answer the phone. */
export interface HandlerCtx {
  /** Host wall ms (input stamps). */
  now(): number;
  /** The phone's character in the running round, or null (lobby, waiting, no round). */
  character(player: PlayerId): Character | null;
  /** The round's world, or null outside a round. */
  world(): World | null;
  /** True while the round's `play` phase runs (commands only act then). */
  playing(): boolean;
  /** Applied at the start of the next sim step, in arrival order (SPEC §12.3). */
  command(cmd: SimCommand): void;
  /** Feeds the match machine; its effects are applied by the runtime. */
  match(event: MatchEvent): void;
  /** Sends a message to that phone only. */
  send(msg: HostMsg, to: PlayerId): void;
  /** Re-sends the phone's private state (outfit, bag, context, open stall view) after a rejoin. */
  resync(player: PlayerId): void;
  readonly inputs: InputStore;
}

/** One discrete phone message's handler (`handlers/<t>.ts`, default export). */
export interface MessageHandler<T extends PhoneMsg['t'] = PhoneMsg['t']> {
  t: T;
  handle(msg: Extract<PhoneMsg, { t: T }>, from: PlayerId, ctx: HandlerCtx): void;
}

/** Helper so a handler file is typed by its tag. */
export const defineHandler = <T extends PhoneMsg['t']>(h: MessageHandler<T>): MessageHandler<T> =>
  h;

/** What a context provider may read: the world and the phone's character. Plain, no relay. */
export interface ContextInput {
  world: World;
  character: Character;
  content: Content;
}

/** One main-button action (`context/<action>.ts`, default export): does it apply now? */
export interface ContextProvider {
  action: NonNullable<MainAction>;
  available(input: ContextInput): boolean;
}

/** Main button priority when several apply (SPEC §6.17): BROWSE > SELL > PICKPOCKET. */
export const MAIN_PRIORITY: readonly NonNullable<MainAction>[] = ['browse', 'sell', 'pickpocket'];
