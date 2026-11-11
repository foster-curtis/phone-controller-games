// Launch URLs (PLATFORM §4, decision #9). No game hardcodes its URL: every surface asks `gameUrl`, so
// moving from one subdomain per game to single-domain paths is a change to `ROUTING` alone.
import { ID_PATTERN } from './types.ts';

export type Routing =
  /** `https://<id>.<domain>/` */
  | { readonly kind: 'subdomain'; readonly domain: string }
  /** `<origin><prefix>/<id>/`, e.g. `https://example.com/play/<id>/` */
  | { readonly kind: 'path'; readonly origin: string; readonly prefix: string };

/** Where the games are deployed today: one Vercel subdomain each. */
export const ROUTING: Routing = { kind: 'subdomain', domain: 'fostercurtis.dev' };

/** The URL that opens a game's TV (host) page. */
export function gameUrl(id: string, routing: Routing = ROUTING): string {
  if (!ID_PATTERN.test(id)) throw new Error(`gameUrl: "${id}" is not a valid game id`);
  if (routing.kind === 'subdomain') return `https://${id}.${routing.domain}/`;
  const origin = routing.origin.replace(/\/+$/, '');
  const prefix = routing.prefix.replace(/^\/*/, '/').replace(/\/+$/, '');
  return `${origin}${prefix}/${id}/`;
}
